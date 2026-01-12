import { Component, createSignal, Show, For } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tag } from "@opencode-ai/ui/tag"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useI18n } from "@/i18n"
import {
  fetchSkillsByRepo,
  installSkill,
  uninstallSkill,
  getRepositories,
  addRepository,
  removeRepository,
  toggleRepository,
  type SkillInfo,
  type SkillsByRepo,
  type SkillsRepository,
} from "@/utils/skill-market"

export const DialogSkillMarket: Component = () => {
  const dialog = useDialog()
  const { t } = useI18n()
  const [skillsByRepo, setSkillsByRepo] = createSignal<SkillsByRepo[]>([])
  const [loading, setLoading] = createSignal(false)
  const [installing, setInstalling] = createSignal<string | null>(null)
  const [uninstalling, setUninstalling] = createSignal<string | null>(null)
  const [showAddRepo, setShowAddRepo] = createSignal(false)
  const [repos, setRepos] = createSignal<SkillsRepository[]>([])
  const [newRepoName, setNewRepoName] = createSignal("")
  const [newRepoUrl, setNewRepoUrl] = createSignal("")

  const loadSkills = async () => {
    setLoading(true)
    try {
      const byRepo = await fetchSkillsByRepo()
      setSkillsByRepo(byRepo)
    } finally {
      setLoading(false)
    }
  }

  const loadRepos = () => {
    setRepos(getRepositories())
  }

  const handleInstall = async (skill: SkillInfo) => {
    setInstalling(skill.id)
    try {
      await installSkill(skill)
      await loadSkills()
    } finally {
      setInstalling(null)
    }
  }

  const handleUninstall = async (skill: SkillInfo) => {
    setUninstalling(skill.id)
    try {
      await uninstallSkill(skill)
      await loadSkills()
    } finally {
      setUninstalling(null)
    }
  }

  const handleRefresh = () => {
    loadSkills()
  }

  const handleAddRepo = () => {
    try {
      if (!newRepoName().trim()) {
        showToast({ title: "添加失败", description: "请输入仓库名称", icon: "warning" })
        return
      }
      if (!newRepoUrl().trim()) {
        showToast({ title: "添加失败", description: "请输入仓库地址", icon: "warning" })
        return
      }

      addRepository(newRepoName().trim(), newRepoUrl().trim())
      showToast({ title: "添加成功", description: `仓库 ${newRepoName()} 已添加`, icon: "check" })
      setNewRepoName("")
      setNewRepoUrl("")
      setShowAddRepo(false)
      loadRepos()
      loadSkills()
    } catch (error) {
      showToast({
        title: "添加失败",
        description: error instanceof Error ? error.message : "未知错误",
        icon: "warning",
      })
    }
  }

  const handleRemoveRepo = (repo: SkillsRepository) => {
    try {
      removeRepository(repo.id)
      showToast({ title: "删除成功", description: `仓库 ${repo.name} 已删除`, icon: "check" })
      loadRepos()
      loadSkills()
    } catch (error) {
      showToast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        icon: "warning",
      })
    }
  }

  const handleToggleRepo = (repo: SkillsRepository) => {
    toggleRepository(repo.id)
    loadRepos()
    loadSkills()
  }

  // Load on mount
  loadSkills()
  loadRepos()

  return (
    <Dialog
      title={t().skillMarket.title}
      actions={
        <div class="flex gap-2">
          <Button
            variant="secondary"
            icon="expand"
            onClick={handleRefresh}
            disabled={loading()}
          >
            {t().skillMarket.refresh}
          </Button>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        {/* 仓库管理区域 */}
        <div class="flex flex-col gap-3 p-4 rounded-lg border border-border-weak-base bg-background-raised">
          <div class="flex items-center justify-between">
            <span class="text-14-medium text-text-strong">仓库管理</span>
            <Button
              variant="primary"
              icon="plus"
              size="small"
              onClick={() => setShowAddRepo(!showAddRepo())}
            >
            {showAddRepo() ? "收起" : "添加仓库"}
          </Button>
          </div>

          {/* 添加仓库表单 */}
          <Show when={showAddRepo()}>
            <div class="flex flex-col gap-2">
              <TextField
                label="仓库名称"
                placeholder="例如: my-custom-skills"
                value={newRepoName()}
                onChange={(e) => setNewRepoName(e.currentTarget.value)}
              />
              <TextField
                label="仓库地址"
                placeholder="https://github.com/username/skills"
                value={newRepoUrl()}
                onChange={(e) => setNewRepoUrl(e.currentTarget.value)}
              />
              <div class="flex gap-2">
                <Button variant="secondary" onClick={() => setShowAddRepo(false)}>
                  取消
                </Button>
                <Button variant="primary" onClick={handleAddRepo}>
                  添加
                </Button>
              </div>
            </div>
          </Show>

          {/* 仓库列表 */}
          <div class="flex flex-col gap-2 max-h-40 overflow-y-auto">
            <For each={repos()}>
              {(repo) => (
                <div class="flex items-center gap-3 p-2 rounded border border-border-weak-base">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-13-medium text-text-strong">
                        {repo.name}
                      </span>
                      <Show when={repo.isDefault}>
                        <span class="text-11-regular text-text-subtle">
                          (默认)
                        </span>
                      </Show>
                    </div>
                    <div class="text-11-regular text-text-subtle truncate">
                      {repo.url}
                    </div>
                  </div>
                  <Show when={!repo.isDefault}>
                    <Button
                      variant={repo.enabled ? "secondary" : "ghost"}
                      size="small"
                      onClick={() => handleToggleRepo(repo)}
                    >
                      {repo.enabled ? "已启用" : "已禁用"}
                    </Button>
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveRepo(repo)}
                      title="删除仓库"
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* 技能列表 */}
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center py-8 text-text-subtle">
              <Spinner class="mr-2" />
              {t().skillMarket.loading}
            </div>
          }
        >
          <Show
            when={skillsByRepo().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 text-text-subtle gap-3">
                <Icon name="folder" size="large" />
                <div class="text-14-regular">{t().skillMarket.noSkills}</div>
              </div>
            }
          >
            <div class="flex flex-col gap-4">
              <For each={skillsByRepo()}>
                {(repo) => (
                  <div class="flex flex-col gap-2">
                    {/* 仓库标题 */}
                    <div class="flex items-center gap-2 px-1">
                      <Icon name="branch" size="small" />
                      <span class="text-14-medium text-text-strong">
                        {repo.repoName}
                      </span>
                      <span class="text-12-regular text-text-subtle">
                        ({repo.skills.length} 个技能)
                      </span>
                    </div>

                    {/* 技能列表 */}
                    <div class="flex flex-col gap-2 pl-4">
                      <For each={repo.skills}>
                        {(skill) => (
                          <div class="flex items-center gap-3 p-3 rounded-lg border border-border-weak-base hover:border-border-weak-base-hover bg-background-raised">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 mb-1">
                                <span class="text-14-medium text-text-strong">
                                  {skill.title}
                                </span>
                                <Show when={skill.installed}>
                                  <Tag variant="success" size="small">
                                    {t().skillMarket.installed}
                                  </Tag>
                                </Show>
                              </div>
                              <div class="text-12-regular text-text-base truncate">
                                {skill.description}
                              </div>
                            </div>
                            <Show
                              when={!skill.installed}
                              fallback={
                                <Button
                                  variant="secondary"
                                  size="small"
                                  icon={uninstalling() === skill.id ? undefined : "trash"}
                                  onClick={() => handleUninstall(skill)}
                                  disabled={uninstalling() !== null}
                                >
                                  {uninstalling() === skill.id ? "卸载中..." : "卸载"}
                                </Button>
                              }
                            >
                              <Button
                                variant={installing() === skill.id ? "secondary" : "primary"}
                                size="small"
                                icon={installing() === skill.id ? undefined : "download"}
                                onClick={() => handleInstall(skill)}
                                disabled={installing() !== null}
                              >
                                {installing() === skill.id
                                  ? t().skillMarket.installing
                                  : t().skillMarket.install}
                              </Button>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <div class="text-12-regular text-text-subtle border-t border-border-weak-base pt-3">
          {t().skillMarket.footer}
        </div>
      </div>
    </Dialog>
  )
}
