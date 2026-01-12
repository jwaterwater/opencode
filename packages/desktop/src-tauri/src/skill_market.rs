use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

const SKILLS_REPO_URL: &str = "https://github.com/anthropics/skills.git";
const SKILLS_DIR_NAME: &str = "skills-market";

/// Skill info returned to frontend
#[derive(serde::Serialize)]
pub struct SkillInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub installed: bool,
}

/// Get the skills market directory path
fn get_skills_market_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join(SKILLS_DIR_NAME))
        .map_err(|e| format!("Failed to get app local data dir: {}", e))
}

/// Get the user's Claude skills directory
fn get_claude_skills_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|dir| dir.join(".claude").join("skills"))
        .ok_or_else(|| "Failed to get home directory".to_string())
}

/// Clone or update the skills repository
#[tauri::command]
pub async fn clone_skills_repo(app: AppHandle) -> Result<String, String> {
    let skills_dir = get_skills_market_dir(&app)?;

    // Check if directory exists and is a valid git repo
    let is_valid_repo = skills_dir.exists() && skills_dir.join(".git").exists();

    if is_valid_repo {
        // Try to pull latest changes
        let output = app
            .shell()
            .command("git")
            .args(["-C", skills_dir.to_str().unwrap(), "pull"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute git pull: {}", e))?;

        if output.status.success() {
            return Ok("Updated skills repository".to_string());
        } else {
            return Err(format!(
                "Git pull failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    // Directory doesn't exist or is not a valid git repo, remove and clone
    if skills_dir.exists() {
        fs::remove_dir_all(&skills_dir)
            .map_err(|e| format!("Failed to remove invalid directory: {}", e))?;
    }

    // Clone the repository
    let parent_dir = skills_dir
        .parent()
        .ok_or("Failed to get parent directory")?;

    // Create parent directory if it doesn't exist
    fs::create_dir_all(parent_dir)
        .map_err(|e| format!("Failed to create parent directory: {}", e))?;

    let output = app
        .shell()
        .command("git")
        .args(["clone", "--depth", "1", SKILLS_REPO_URL, skills_dir.to_str().unwrap()])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if output.status.success() {
        Ok("Cloned skills repository".to_string())
    } else {
        Err(format!(
            "Git clone failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Get list of skills by scanning the cloned repository
#[tauri::command]
pub async fn get_skills_list(app: AppHandle) -> Result<Vec<SkillInfo>, String> {
    let skills_market_dir = get_skills_market_dir(&app)?;

    if !skills_market_dir.exists() {
        return Err("Skills repository not cloned. Call clone_skills_repo first.".to_string());
    }

    // Skills are in the "skills" subdirectory
    let skills_dir = skills_market_dir.join("skills");
    if !skills_dir.exists() {
        return Err("Skills directory not found in repository.".to_string());
    }

    // Get installed skills from ~/.claude/skills
    let claude_skills_dir = get_claude_skills_dir();
    let installed_skills: HashSet<String> = if let Ok(dir) = claude_skills_dir {
        if dir.exists() {
            fs::read_dir(&dir)
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .filter(|e| e.path().is_dir())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default()
        } else {
            std::collections::HashSet::new()
        }
    } else {
        std::collections::HashSet::new()
    };

    let mut skills = Vec::new();

    // Scan directory for skill folders (containing skill.md)
    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip if not a directory
        if !path.is_dir() {
            continue;
        }

        // Skip hidden directories
        let file_name = entry.file_name();
        if file_name.to_string_lossy().starts_with('.') {
            continue;
        }

        let skill_id = file_name.to_string_lossy().to_string();

        // Check if skill.md exists
        let skill_md = path.join("skill.md");
        if !skill_md.exists() {
            continue;
        }

        // Read skill.md to extract title and description
        let content = fs::read_to_string(&skill_md)
            .map_err(|e| format!("Failed to read skill.md: {}", e))?;

        // Parse YAML front matter (between --- markers)
        let (name, description) = if content.starts_with("---") {
            // Parse YAML for name and description
            let mut skill_name = skill_id.clone();
            let mut skill_desc = String::new();

            for line in content.lines() {
                if line == "---" {
                    // End of YAML section
                    break;
                }
                if let Some(rest) = line.strip_prefix("name:") {
                    skill_name = rest.trim().to_string();
                } else if let Some(rest) = line.strip_prefix("description:") {
                    skill_desc = rest.trim().to_string();
                }
            }

            // If no description in YAML, get content after YAML
            if skill_desc.is_empty() {
                let after_yaml: String = content
                    .lines()
                    .skip_while(|l| *l != "---")
                    .skip(1) // Skip first ---
                    .skip_while(|l| *l != "---")
                    .skip(1) // Skip second ---
                    .skip_while(|l| l.starts_with("#") || l.trim().is_empty())
                    .take(1)
                    .map(|s| s.to_string())
                    .next()
                    .unwrap_or_else(|| "No description".to_string());
                skill_desc = after_yaml;
            }

            (skill_name, skill_desc)
        } else {
            // No YAML front matter, try old format
            let title = content
                .lines()
                .find(|line| line.starts_with("# "))
                .unwrap_or("# Unknown")
                .trim_start_matches("# ")
                .to_string();

            let description = content
                .lines()
                .skip_while(|line| line.starts_with("# ") || line.trim().is_empty())
                .take(1)
                .map(|s| s.to_string())
                .next()
                .unwrap_or_else(|| "No description".to_string());

            (title, description)
        };

        skills.push(SkillInfo {
            id: skill_id.clone(),
            title: name,
            description,
            installed: installed_skills.contains(&skill_id),
        });
    }

    // Sort by id
    skills.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(skills)
}

/// Install a skill by copying it to the user's claude skills directory
#[tauri::command]
pub async fn install_skill(
    app: AppHandle,
    skill_id: String,
) -> Result<String, String> {
    let skills_market_dir = get_skills_market_dir(&app)?;
    // Skills are in the "skills" subdirectory
    let skill_source = skills_market_dir.join("skills").join(&skill_id);

    if !skill_source.exists() {
        return Err(format!("Skill {} not found in market", skill_id));
    }

    // Get user's home directory and .claude/skills path
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let claude_skills_dir = home_dir.join(".claude").join("skills");
    let skill_dest = claude_skills_dir.join(&skill_id);

    // Create destination directory if it doesn't exist
    fs::create_dir_all(&claude_skills_dir)
        .map_err(|e| format!("Failed to create claude skills directory: {}", e))?;

    // Remove existing skill directory if it exists
    if skill_dest.exists() {
        fs::remove_dir_all(&skill_dest)
            .map_err(|e| format!("Failed to remove existing skill: {}", e))?;
    }

    // Copy the skill directory
    copy_dir_recursive(&skill_source, &skill_dest)
        .map_err(|e| format!("Failed to copy skill: {}", e))?;

    Ok(format!(
        "Skill {} installed to {}",
        skill_id,
        skill_dest.display()
    ))
}

/// Uninstall a skill by removing it from ~/.claude/skills
#[tauri::command]
pub async fn uninstall_skill(skill_id: String) -> Result<String, String> {
    let claude_skills_dir = get_claude_skills_dir()?;
    let skill_path = claude_skills_dir.join(&skill_id);

    if !skill_path.exists() {
        return Err(format!("Skill {} is not installed", skill_id));
    }

    // Remove the skill directory
    fs::remove_dir_all(&skill_path)
        .map_err(|e| format!("Failed to remove skill: {}", e))?;

    Ok(format!("Skill {} uninstalled", skill_id))
}

/// Get the skills market directory path (for frontend use)
#[tauri::command]
pub async fn get_skills_dir(app: AppHandle) -> Result<String, String> {
    let path = get_skills_market_dir(&app)?;
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

/// Recursively copy a directory
fn copy_dir_recursive(source: &PathBuf, destination: &PathBuf) -> std::io::Result<()> {
    if !destination.exists() {
        fs::create_dir_all(destination)?;
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dest_path = destination.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)?;
        }
    }

    Ok(())
}
