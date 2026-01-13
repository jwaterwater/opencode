use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpConfigData {
    #[serde(rename = "local")]
    Local {
        command: Vec<String>,
        #[serde(default)]
        environment: Option<std::collections::HashMap<String, String>>,
    },
    #[serde(rename = "remote")]
    Remote {
        url: String,
        #[serde(default)]
        enabled: Option<bool>,
        #[serde(default)]
        headers: Option<std::collections::HashMap<String, String>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub name: String,
    #[serde(flatten)]
    pub data: McpConfigData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenCodeConfig {
    #[serde(default)]
    mcp: Option<std::collections::HashMap<String, McpConfigData>>,
    #[serde(default)]
    tools: Option<std::collections::HashMap<String, bool>>,
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .resolve("", tauri::path::BaseDirectory::Home)
        .map_err(|e| format!("Failed to resolve home dir: {}", e))?;

    Ok(home_dir.join(".config").join("opencode").join("opencode.json"))
}

#[tauri::command]
pub fn read_mcp_configs(app: AppHandle) -> Result<Vec<McpConfig>, String> {
    let config_path = get_config_path(&app)?;

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: OpenCodeConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let mcp_map = config.mcp.unwrap_or_default();
    Ok(mcp_map
        .into_iter()
        .map(|(name, data)| McpConfig { name, data })
        .collect())
}

#[tauri::command]
pub fn write_mcp_configs(
    app: AppHandle,
    configs: Vec<McpConfig>,
) -> Result<(), String> {
    let config_path = get_config_path(&app)?;

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    // Read existing config or create new
    let mut existing_config: OpenCodeConfig = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse existing config: {}", e))?
    } else {
        OpenCodeConfig {
            mcp: None,
            tools: None,
        }
    };

    // Convert configs to map (key is the name)
    let mcp_map: std::collections::HashMap<String, McpConfigData> = configs
        .into_iter()
        .map(|c| (c.name.clone(), c.data))
        .collect();

    existing_config.mcp = Some(mcp_map);

    // Add schema if not present
    let mut value = serde_json::to_value(&existing_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    if let Some(obj) = value.as_object_mut() {
        if !obj.contains_key("$schema") {
            obj.insert(
                "$schema".into(),
                serde_json::json!("https://opencode.ai/config.json"),
            );
        }
    }

    let content = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}
