/** Decode before saving; original bytes are kept unchanged. */
export async function makeThumbnail(file: File): Promise<Blob> {
  if (file.size > 40 * 1024 * 1024) throw new Error('图片超过 40 MB，请先缩小后再导入')
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片。HEIC 请先导出为 JPG。')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('无法打开这张图片，请换一张照片或导出为 JPG') })
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('图片尺寸过大，请先缩小到 8000 万像素以内')
    const ratio = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('缩略图生成失败')), 'image/webp', .85))
  } finally { URL.revokeObjectURL(url) }
}
