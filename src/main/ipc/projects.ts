import {
  IPC_CHANNELS,
  createProjectRequestSchema,
  noPayloadSchema,
  projectIdRequestSchema,
  projectNameRequestSchema,
  saveMetadataRequestSchema,
  setAiGeneratedRequestSchema,
} from '@shared/ipc'
import { getDb } from '../services/db'
import { setSetting } from '../db/repositories/settings'
import {
  createProject,
  deleteProject,
  duplicateProject,
  ensureActiveProject,
  getActiveProjectId,
  getProjectDetail,
  getProjectSummary,
  listProjects,
  renameProject,
  saveMetadataEdit,
  setActiveProjectId,
  setProjectAiGenerated,
} from '../db/repositories/projects'
import { registerIpcHandler } from './wrapper'

export function registerProjectsHandlers(): void {
  const db = () => getDb()

  registerIpcHandler(IPC_CHANNELS.PROJECTS_LIST, noPayloadSchema, () => ({
    projects: listProjects(db()),
  }))

  registerIpcHandler(IPC_CHANNELS.PROJECTS_GET, projectIdRequestSchema, (request) => {
    const detail = getProjectDetail(db(), request.id)
    if (!detail) throw new Error(`Project ${request.id} not found`)
    return { project: detail }
  })

  registerIpcHandler(IPC_CHANNELS.PROJECTS_GET_ACTIVE, noPayloadSchema, () => {
    const activeId = getActiveProjectId(db())
    if (!activeId) return { project: null }
    return { project: getProjectDetail(db(), activeId) }
  })

  registerIpcHandler(IPC_CHANNELS.PROJECTS_CREATE, createProjectRequestSchema, (request) => {
    const project = createProject(db(), { name: request.name })
    setActiveProjectId(db(), project.id)
    return { project }
  })

  registerIpcHandler(IPC_CHANNELS.PROJECTS_SET_ACTIVE, projectIdRequestSchema, (request) => {
    getProjectSummary(db(), request.id) // Throws when the project does not exist.
    setActiveProjectId(db(), request.id)
    return { activeProjectId: request.id }
  })

  registerIpcHandler(IPC_CHANNELS.PROJECTS_RENAME, projectNameRequestSchema, (request) => ({
    project: renameProject(db(), request.id, request.name),
  }))

  registerIpcHandler(IPC_CHANNELS.PROJECTS_DUPLICATE, projectIdRequestSchema, (request) => ({
    project: duplicateProject(db(), request.id),
  }))

  registerIpcHandler(IPC_CHANNELS.PROJECTS_DELETE, projectIdRequestSchema, (request) => {
    const wasActive = getActiveProjectId(db()) === request.id
    deleteProject(db(), request.id)
    if (wasActive) {
      // Always leave the app with a valid active project.
      const fresh = ensureActiveProject(db())
      setSetting(db(), 'activeProjectId', fresh.id)
    }
    return { deleted: true }
  })

  registerIpcHandler(IPC_CHANNELS.PROJECTS_SAVE_METADATA, saveMetadataRequestSchema, (request) => {
    saveMetadataEdit(db(), request.imageId, request.patch)
    return { saved: true }
  })

  registerIpcHandler(
    IPC_CHANNELS.PROJECTS_SET_AI_GENERATED,
    setAiGeneratedRequestSchema,
    (request) => ({
      project: setProjectAiGenerated(db(), request.id, request.aiGenerated),
    }),
  )
}
