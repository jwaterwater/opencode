import { invoke } from "@tauri-apps/api/core"
import { showToast } from "@opencode-ai/ui/toast"

// 默认仓库
const DEFAULT_REPOSITORIES = [
  {
    id: "default",
    name: "anthropics/skills",
    url: "https://github.com/anthropics/skills",
    enabled: true,
    isDefault: true,
  }
]

export interface SkillInfo {
  id: string
  title: string
  description: string
  installed: boolean
  sourceRepo?: string  // 来源仓库 ID
  sourceRepoName?: string  // 来源仓库名称
  category?: string
  author?: string
  version?: string
  repoUrl?: string
  rawUrl?: string
  icon?: string
  tags?: string[]
  dependencies?: string[]
  minClaudeVersion?: string
  featured?: boolean
}

export interface SkillsRepository {
  id: string
  name: string
  url: string
  enabled: boolean
  isDefault: boolean
}

export interface SkillsByRepo {
  repoId: string
  repoName: string
  skills: SkillInfo[]
}

// 存储键名
const REPOSITORIES_KEY = "skills-repositories"
const INSTALLED_SKILLS_KEY = "claude-skills-installed"

/**
 * 获取已安装的技能 ID 列表
 */
export function getInstalledSkillsList(): string[] {
  const stored = localStorage.getItem(INSTALLED_SKILLS_KEY)
  return stored ? JSON.parse(stored) : []
}

/**
 * 标记技能为已安装
 */
export function markSkillInstalled(skillId: string): void {
  const installed = getInstalledSkillsList()
  if (!installed.includes(skillId)) {
    installed.push(skillId)
    localStorage.setItem(INSTALLED_SKILLS_KEY, JSON.stringify(installed))
  }
}

/**
 * 标记技能为未安装
 */
export function markSkillUninstalled(skillId: string): void {
  const installed = getInstalledSkillsList()
  const filtered = installed.filter(id => id !== skillId)
  localStorage.setItem(INSTALLED_SKILLS_KEY, JSON.stringify(filtered))
}

/**
 * 获取所有仓库列表
 */
export function getRepositories(): SkillsRepository[] {
  const stored = localStorage.getItem(REPOSITORIES_KEY)
  if (!stored) {
    return DEFAULT_REPOSITORIES
  }
  const repos = JSON.parse(stored) as SkillsRepository[]
  // 确保默认仓库始终存在
  const hasDefault = repos.some(r => r.isDefault)
  if (!hasDefault) {
    return [...DEFAULT_REPOSITORIES, ...repos]
  }
  return repos
}

/**
 * 保存仓库列表
 */
function saveRepositories(repos: SkillsRepository[]): void {
  localStorage.setItem(REPOSITORIES_KEY, JSON.stringify(repos))
}

/**
 * 添加新仓库
 */
export function addRepository(name: string, url: string): SkillsRepository {
  const repos = getRepositories()
  const id = `repo-${Date.now()}`

  // 检查重名
  if (repos.some(r => r.name === name)) {
    throw new Error("仓库名称已存在")
  }

  const newRepo: SkillsRepository = {
    id,
    name,
    url,
    enabled: true,
    isDefault: false,
  }

  saveRepositories([...repos, newRepo])
  return newRepo
}

/**
 * 删除仓库
 */
export function removeRepository(id: string): void {
  const repos = getRepositories()
  const repo = repos.find(r => r.id === id)

  if (repo?.isDefault) {
    throw new Error("无法删除默认仓库")
  }

  saveRepositories(repos.filter(r => r.id !== id))
}

/**
 * 切换仓库启用状态
 */
export function toggleRepository(id: string): void {
  const repos = getRepositories()
  const updated = repos.map(r =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  )
  saveRepositories(updated)
}

/**
 * 获取启用的仓库列表
 */
export function getEnabledRepositories(): SkillsRepository[] {
  return getRepositories().filter(r => r.enabled)
}

/**
 * 从单个仓库获取技能列表
 */
async function fetchSkillsFromRepository(repo: SkillsRepository): Promise<SkillInfo[]> {
  try {
    // 构造 raw.githubusercontent.com URL
    const rawUrl = repo.url.replace("github.com", "raw.githubusercontent.com") + "/main"
    const skillsListUrl = `${rawUrl}/skills/`

    // 获取技能列表 - 解析目录页面
    const response = await fetch(`${skillsListUrl}`)
    if (!response.ok) {
      return []  // 仓库可能没有 skills 目录
    }

    const text = await response.text()
    // 简单解析目录中的子文件夹
    const dirMatches = text.matchAll(/href="([^\/]+)\/"/g)
    const skillFolders = Array.from(dirMatches)
      .map(m => m[1])
      .filter(name => !name.startsWith(".") && name !== "skills")

    const skills: SkillInfo[] = []

    for (const skillId of skillFolders) {
      try {
        // 获取 skill.md
        const skillMdUrl = `${skillsListUrl}${skillId}/skill.md`
        const mdResponse = await fetch(skillMdUrl)
        if (!mdResponse.ok) continue

        const content = await mdResponse.text()

        // 解析 YAML front matter
        let title = skillId
        let description = "No description"

        if (content.startsWith("---")) {
          for (const line of content.split("\n")) {
            if (line === "---") break
            if (line.startsWith("name:")) {
              title = line.replace("name:", "").trim()
            } else if (line.startsWith("description:")) {
              description = line.replace("description:", "").trim()
            }
          }
        }

        skills.push({
          id: skillId,
          title,
          description,
          installed: false,  // 稍后统一检查
          sourceRepo: repo.id,
          sourceRepoName: repo.name,
        })
      } catch {
        // 跳过获取失败的技能
        continue
      }
    }

    return skills
  } catch {
    return []
  }
}

/**
 * Clone/update the skills repository (保持向后兼容)
 */
export async function cloneSkillsRepo(): Promise<string> {
  return invoke("clone_skills_repo")
}

/**
 * 获取已安装的技能列表
 */
function getInstalledSkills(): Set<string> {
  return new Set(getInstalledSkillsList())
}

/**
 * Fetch skills by scanning the cloned repository
 */
export async function fetchSkills(): Promise<SkillInfo[]> {
  try {
    showToast({
      title: "正在获取技能列表...",
      description: "正在从仓库加载",
    })

    // 方式1: 从本地克隆的仓库获取（向后兼容）
    await cloneSkillsRepo()
    const localSkills = await invoke<SkillInfo[]>("get_skills_list")

    // 方式2: 从远程仓库获取（新增的仓库）
    const enabledRepos = getEnabledRepositories().filter(r => !r.isDefault)
    const remoteSkillsByRepo: SkillInfo[] = []

    for (const repo of enabledRepos) {
      const skills = await fetchSkillsFromRepository(repo)
      remoteSkillsByRepo.push(...skills)
    }

    // 合并结果，本地仓库优先（先入为主）
    const allSkills = [...localSkills, ...remoteSkillsByRepo]

    showToast({
      title: "技能列表加载完成",
      description: `找到 ${allSkills.length} 个技能`,
      icon: "check",
    })

    return allSkills
  } catch (error) {
    showToast({
      title: "获取技能列表失败",
      description: error instanceof Error ? error.message : "未知错误",
      icon: "warning",
    })
    return []
  }
}

/**
 * Fetch skills grouped by repository
 */
export async function fetchSkillsByRepo(): Promise<SkillsByRepo[]> {
  const enabledRepos = getEnabledRepositories()
  const result: SkillsByRepo[] = []

  // 获取已安装技能列表
  const installedSet = getInstalledSkills()

  for (const repo of enabledRepos) {
    let skills: SkillInfo[] = []

    if (repo.isDefault) {
      // 默认仓库从本地获取
      await cloneSkillsRepo()
      skills = await invoke<SkillInfo[]>("get_skills_list")
    } else {
      // 自定义仓库从远程获取
      skills = await fetchSkillsFromRepository(repo)
    }

    // 更新安装状态
    skills = skills.map(s => ({
      ...s,
      installed: s.installed || installedSet.has(s.id),
      sourceRepo: repo.id,
      sourceRepoName: repo.name,
    }))

    result.push({
      repoId: repo.id,
      repoName: repo.name,
      skills,
    })
  }

  return result
}

/**
 * Install a skill by copying it to ~/.claude/skills
 */
export async function installSkill(skill: SkillInfo): Promise<boolean> {
  try {
    showToast({
      title: `正在安装 ${skill.title}...`,
      description: "正在复制技能文件",
    })

    await invoke("install_skill", { skillId: skill.id })

    // 标记为已安装
    markSkillInstalled(skill.id)

    showToast({
      title: "安装成功",
      description: `${skill.title} 已安装到 ~/.claude/skills/${skill.id}`,
      icon: "check",
    })

    return true
  } catch (error) {
    showToast({
      title: "安装失败",
      description: error instanceof Error ? error.message : "未知错误",
      icon: "warning",
    })
    return false
  }
}

/**
 * Uninstall a skill by removing it from ~/.claude/skills
 */
export async function uninstallSkill(skill: SkillInfo): Promise<boolean> {
  try {
    showToast({
      title: `正在卸载 ${skill.title}...`,
      description: "正在删除技能文件",
    })

    await invoke("uninstall_skill", { skillId: skill.id })

    // 标记为未安装
    markSkillUninstalled(skill.id)

    showToast({
      title: "卸载成功",
      description: `${skill.title} 已从 ~/.claude/skills/${skill.id} 删除`,
      icon: "check",
    })

    return true
  } catch (error) {
    showToast({
      title: "卸载失败",
      description: error instanceof Error ? error.message : "未知错误",
      icon: "warning",
    })
    return false
  }
}
