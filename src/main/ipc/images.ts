import { showOpenDialogInView } from '../lib/dialogs'
import {
  IPC_CHANNELS,
  addImagesRequestSchema,
  noPayloadSchema,
  relinkImageRequestSchema,
  thumbnailRequestSchema,
} from '@shared/ipc'
import { addImagesToActiveProject, getImageThumbnail, relinkImageFile } from '../services/images'
import { registerIpcHandler } from './wrapper'

const OPEN_DIALOG_FILTERS = [
  { name: 'Images (JPG, PNG, WEBP)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
  { name: 'All Files', extensions: ['*'] },
]

export function registerImagesHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.IMAGES_PICK_FILES, noPayloadSchema, async () => {
    const result = await showOpenDialogInView({
      title: 'Import images',
      properties: ['openFile', 'multiSelections'],
      filters: OPEN_DIALOG_FILTERS,
    })
    return { paths: result.canceled ? [] : result.filePaths }
  })

  registerIpcHandler(IPC_CHANNELS.IMAGES_ADD, addImagesRequestSchema, (request) =>
    addImagesToActiveProject(request.paths),
  )

  registerIpcHandler(IPC_CHANNELS.IMAGES_RELINK, relinkImageRequestSchema, (request) =>
    relinkImageFile(request.imageId),
  )

  registerIpcHandler(IPC_CHANNELS.IMAGES_GET_THUMBNAIL, thumbnailRequestSchema, (request) =>
    getImageThumbnail(request.path),
  )
}
