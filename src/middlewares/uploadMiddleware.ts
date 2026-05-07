import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction, RequestHandler } from 'express';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 20;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error('INVALID_FILE_TYPE'));
};

export const propertyPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILE_COUNT,
  },
  fileFilter,
});

export const propertyPhotoUploadHandler = propertyPhotoUpload.array(
  'photos',
  MAX_FILE_COUNT,
);

// PUT /properties/:id aceita application/json (caminho legado) E multipart/form-data
// (novo caminho para adicionar fotos via edição). Multer consome o stream do request,
// então só pode rodar quando o Content-Type é multipart — em JSON, ele derrubaria o
// body parser. Este wrapper despacha apenas quando o header bate.
export const conditionalPropertyPhotoUploadHandler: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    return propertyPhotoUploadHandler(req, res, next);
  }
  return next();
};
