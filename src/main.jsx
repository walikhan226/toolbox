import React, { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import './styles.css'

const categories = [
  { id: 'all', label: 'All Tools' },
  { id: 'video', label: 'Video & Audio' },
  { id: 'docs', label: 'PDF & Docs' },
  { id: 'image', label: 'Images' },
  { id: 'utility', label: 'Utilities' },
]

const tools = [
  { id: 'video-compress', icon: '🎬', iconClass: 'icon-video-compress', category: 'video', title: 'Video Compressor', text: 'Shrink MP4, WebM & MOV file sizes fast without quality loss.' },
  { id: 'video-convert', icon: '📽', iconClass: 'icon-video-convert', category: 'video', title: 'Video Converter', text: 'Convert videos to MP4, WebM, animated GIF, or extract MP3 audio.' },
  { id: 'convert', icon: '⇄', iconClass: 'icon-convert', category: 'image', title: 'Image Converter', text: 'Convert JPG, PNG and WebP images in seconds.' },
  { id: 'compress', icon: '◒', iconClass: 'icon-compress', category: 'image', title: 'Image Compressor', text: 'Make image files smaller without losing quality.' },
  { id: 'resize', icon: '⛶', iconClass: 'icon-resize', category: 'image', title: 'Image Resizer', text: 'Resize images to the exact dimensions you need.' },
  { id: 'hd-1080', icon: '✦', iconClass: 'icon-hd', category: 'image', title: '1080p HD Upscaler', text: 'Scale & enhance images to 1080p Full HD with clarity boost.' },
  { id: 'pdf', icon: '📄', iconClass: 'icon-pdf', category: 'docs', title: 'PDF Compressor', text: 'Reduce PDF file size while keeping crisp pages.' },
  { id: 'compress-50mb', icon: '⚖', iconClass: 'icon-target', category: 'docs', title: 'Target 50MB Compressor', text: 'Fit PDFs and media under 50 MB, 25 MB, or custom upload limits.' },
  { id: 'pdf-to-word', icon: '🖹', iconClass: 'icon-word', category: 'docs', title: 'PDF to Word', text: 'Convert PDF documents into editable Word (.docx) documents.' },
  { id: 'ppt-to-word', icon: '🗒', iconClass: 'icon-ppt', category: 'docs', title: 'PPT to Word Notes', text: 'Convert PowerPoint slides into organized Word study notes.' },
  { id: 'qr', icon: '▦', iconClass: 'icon-qr', category: 'utility', title: 'QR Generator', text: 'Create clean QR codes for any link or text.' },
]

// Universal file saver triggering direct local download
function saveFileLocally(blobOrUrl, filename) {
  if (!blobOrUrl) return

  const url = blobOrUrl instanceof Blob ? URL.createObjectURL(blobOrUrl) : blobOrUrl
  if (!url) return

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename || 'download')
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()

  setTimeout(() => {
    if (link.parentNode) {
      document.body.removeChild(link)
    }
  }, 1500)
}

// Helper to access or lazily load PDF.js in the browser
const getPdfJs = async () => {
  if (typeof window === 'undefined') return null
  if (window.pdfjsLib) {
    if (window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    return window.pdfjsLib
  }
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      }
      resolve(window.pdfjsLib || null)
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

// Client-side PDF compression engine
async function compressPdfFile(file, preset, qualityPercent, onProgress) {
  const fileBuffer = await file.arrayBuffer()

  if (preset === 'lossless') {
    onProgress?.('Optimizing streams and stripping metadata...')
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true, updateMetadata: false })
    pdfDoc.setTitle('')
    pdfDoc.setAuthor('')
    pdfDoc.setSubject('')
    pdfDoc.setKeywords([])
    pdfDoc.setProducer('')
    pdfDoc.setCreator('')
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true })
    return new Blob([compressedBytes], { type: 'application/pdf' })
  }

  const pdfjs = await getPdfJs()
  if (!pdfjs) {
    onProgress?.('Optimizing PDF structure...')
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true, updateMetadata: false })
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true })
    return new Blob([compressedBytes], { type: 'application/pdf' })
  }

  onProgress?.('Reading PDF pages...')
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBuffer) })
  const pdf = await loadingTask.promise
  const numPages = pdf.numPages

  const scale = preset === 'extreme' ? 1.0 : (qualityPercent > 80 ? 1.6 : 1.3)
  const jpegQuality = preset === 'extreme' ? Math.min(0.55, qualityPercent / 100) : (qualityPercent / 100)

  const newDoc = await PDFDocument.create()

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(`Compressing page ${i} of ${numPages}...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: ctx, viewport }).promise

    const imgBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', jpegQuality))
    const imgBytes = await imgBlob.arrayBuffer()
    const embeddedImg = await newDoc.embedJpg(imgBytes)

    const unscaledViewport = page.getViewport({ scale: 1.0 })
    const newPage = newDoc.addPage([unscaledViewport.width, unscaledViewport.height])
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
    })
  }

  onProgress?.('Finalizing compressed PDF...')
  const outputBytes = await newDoc.save({ useObjectStreams: true })
  return new Blob([outputBytes], { type: 'application/pdf' })
}

// 1. PDF to Word (.docx) Converter
async function convertPdfToWord(file, onProgress) {
  const fileBuffer = await file.arrayBuffer()
  const pdfjs = await getPdfJs()
  if (!pdfjs) throw new Error('PDF reader not initialized.')

  onProgress?.('Reading PDF document structure...')
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBuffer) })
  const pdf = await loadingTask.promise
  const numPages = pdf.numPages

  const docParagraphs = []
  const titleName = file.name.replace(/\.[^.]+$/, '')

  docParagraphs.push(
    new Paragraph({
      text: titleName,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Converted from PDF with Toolbox · ${numPages} page${numPages > 1 ? 's' : ''}`,
          italics: true,
          color: '556655',
          size: 20,
        }),
      ],
      spacing: { after: 400 },
    })
  )

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(`Extracting text from page ${pageNum} of ${numPages}...`)
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    docParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Page ${pageNum}`,
            bold: true,
            color: '173b30',
            size: 24,
          }),
        ],
        spacing: { before: 280, after: 140 },
      })
    )

    const items = textContent.items
    if (!items || items.length === 0) {
      docParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '(No selectable text found on this page)', italics: true, color: '888888' })],
          spacing: { after: 200 },
        })
      )
      continue
    }

    // Sort items top-to-bottom, left-to-right
    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]
      if (Math.abs(yDiff) > 5) return yDiff
      return a.transform[4] - b.transform[4]
    })

    let currentY = null
    let lineTokens = []

    for (const item of sorted) {
      const str = item.str || ''
      if (!str.trim()) continue
      const y = item.transform[5]
      if (currentY === null || Math.abs(currentY - y) > 6) {
        if (lineTokens.length > 0) {
          const lineText = lineTokens.join(' ').trim()
          if (lineText) {
            docParagraphs.push(
              new Paragraph({
                children: [new TextRun({ text: lineText, size: 22 })],
                spacing: { after: 120 },
              })
            )
          }
          lineTokens = []
        }
        currentY = y
      }
      lineTokens.push(str)
    }

    if (lineTokens.length > 0) {
      const lineText = lineTokens.join(' ').trim()
      if (lineText) {
        docParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: lineText, size: 22 })],
            spacing: { after: 200 },
          })
        )
      }
    }
  }

  onProgress?.('Generating editable Word document (.docx)...')
  const doc = new Document({
    sections: [{ properties: {}, children: docParagraphs }],
  })

  return await Packer.toBlob(doc)
}

// 2. PPT to Word Notes (.docx)
async function convertPptToWordNotes(file, includeNotes, onProgress) {
  onProgress?.('Reading PowerPoint presentation...')
  const zip = await JSZip.loadAsync(file)

  const slideFiles = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name)
  )

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/)[1], 10)
    const numB = parseInt(b.match(/slide(\d+)\.xml/)[1], 10)
    return numA - numB
  })

  if (slideFiles.length === 0) {
    throw new Error('No slides found in this presentation.')
  }

  const docParagraphs = []
  const titleName = file.name.replace(/\.[^.]+$/, '')

  docParagraphs.push(
    new Paragraph({
      text: `${titleName} — Presentation Notes`,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Converted from ${slideFiles.length} slides with Toolbox · Formatted Notes & Highlights`,
          italics: true,
          color: '556655',
          size: 20,
        }),
      ],
      spacing: { after: 400 },
    })
  )

  const parser = new DOMParser()

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i]
    const slideNum = i + 1
    onProgress?.(`Processing Slide ${slideNum} of ${slideFiles.length}...`)

    const slideXmlStr = await zip.files[slidePath].async('string')
    const xmlDoc = parser.parseFromString(slideXmlStr, 'application/xml')

    const pNodes = xmlDoc.getElementsByTagName('a:p')
    const slideLines = []

    for (let pIdx = 0; pIdx < pNodes.length; pIdx++) {
      const pNode = pNodes[pIdx]
      const tNodes = pNode.getElementsByTagName('a:t')
      let lineText = ''
      for (let tIdx = 0; tIdx < tNodes.length; tIdx++) {
        lineText += tNodes[tIdx].textContent
      }
      lineText = lineText.trim()
      if (lineText) {
        slideLines.push(lineText)
      }
    }

    let speakerNotes = ''
    if (includeNotes) {
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
      if (zip.files[notesPath]) {
        const notesXmlStr = await zip.files[notesPath].async('string')
        const notesXmlDoc = parser.parseFromString(notesXmlStr, 'application/xml')
        const notesPNodes = notesXmlDoc.getElementsByTagName('a:p')
        const notesLines = []
        for (let np = 0; np < notesPNodes.length; np++) {
          const ntNodes = notesPNodes[np].getElementsByTagName('a:t')
          let ntText = ''
          for (let nt = 0; nt < ntNodes.length; nt++) {
            ntText += ntNodes[nt].textContent
          }
          ntText = ntText.trim()
          if (ntText && !ntText.includes(`Slide ${slideNum}`)) {
            notesLines.push(ntText)
          }
        }
        speakerNotes = notesLines.join('\n')
      }
    }

    const slideTitle = slideLines.length > 0 ? slideLines[0] : `Slide ${slideNum}`
    docParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Slide ${slideNum}: ${slideTitle}`,
            bold: true,
            color: '173b30',
            size: 26,
          }),
        ],
        spacing: { before: 350, after: 150 },
      })
    )

    const bodyLines = slideLines.length > 1 ? slideLines.slice(1) : []
    if (bodyLines.length > 0) {
      for (const line of bodyLines) {
        docParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: '•  ', bold: true, color: 'e25f39' }),
              new TextRun({ text: line, size: 22 }),
            ],
            spacing: { after: 100 },
          })
        )
      }
    } else if (slideLines.length === 0) {
      docParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '(Diagram / graphic slide with no body text)', italics: true, color: '888888' })],
          spacing: { after: 150 },
        })
      )
    }

    if (speakerNotes.trim()) {
      docParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Speaker Notes: ', bold: true, italics: true, color: '643ea8' }),
            new TextRun({ text: speakerNotes, italics: true, color: '444444' }),
          ],
          spacing: { before: 120, after: 200 },
        })
      )
    }
  }

  onProgress?.('Building formatted Word Notes (.docx)...')
  const doc = new Document({
    sections: [{ properties: {}, children: docParagraphs }],
  })

  return await Packer.toBlob(doc)
}

// 3. Compress File to 50 MB / Target Size
async function compressToTargetSize(file, targetMB, onProgress) {
  const currentMB = file.size / (1024 * 1024)
  const ratio = (targetMB / currentMB) * 0.92

  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
    let targetQuality = 75
    if (ratio < 0.3) targetQuality = 38
    else if (ratio < 0.6) targetQuality = 52
    else if (ratio < 0.85) targetQuality = 68

    onProgress?.(`Calibrating PDF compression to fit under ${targetMB} MB...`)
    return await compressPdfFile(file, 'extreme', targetQuality, onProgress)
  } else if (file.type.startsWith('image/')) {
    onProgress?.(`Resizing image to fit under ${targetMB} MB...`)
    const img = new Image()
    const url = URL.createObjectURL(file)
    await new Promise((res) => { img.onload = res; img.src = url })

    const canvas = document.createElement('canvas')
    const scaleFactor = Math.min(1.0, Math.sqrt(Math.max(0.1, ratio)))
    canvas.width = Math.round(img.width * scaleFactor)
    canvas.height = Math.round(img.height * scaleFactor)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const quality = Math.max(0.25, Math.min(0.85, ratio))
    return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
  } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|wmv|m4v|flv)$/i.test(file.name)) {
    let preset = 'balanced'
    let customCrf = 28
    let resCap = '720'
    if (ratio < 0.25) {
      preset = 'custom'
      customCrf = 34
      resCap = '480'
    } else if (ratio < 0.5) {
      preset = 'space-saver'
      customCrf = 31
      resCap = '480'
    } else if (ratio < 0.8) {
      preset = 'balanced'
      customCrf = 28
      resCap = '720'
    } else {
      preset = 'hd'
      customCrf = 24
      resCap = '1080'
    }
    onProgress?.(`Calibrating video compression to fit under ${targetMB} MB...`)
    return await compressVideoFile(file, preset, customCrf, resCap, null, onProgress)
  } else {
    throw new Error('Please upload a PDF, Video, or Image file for target compression.')
  }
}

// 4. Image PNG to 1080 High Quality Image
async function convertImageTo1080p(file, mode, applySharpening, format, onProgress) {
  onProgress?.('Loading image data...')
  const img = new Image()
  const url = URL.createObjectURL(file)
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })

  let targetWidth = 1920
  let targetHeight = 1080

  if (mode === 'square') {
    targetWidth = 1080
    targetHeight = 1080
  } else if (mode === 'portrait') {
    targetWidth = 1080
    targetHeight = 1920
  } else if (mode === 'height') {
    targetHeight = 1080
    targetWidth = Math.round((img.width / img.height) * 1080)
  }

  onProgress?.(`Rendering 1080p canvas (${targetWidth} × ${targetHeight})...`)
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const scale = Math.min(targetWidth / img.width, targetHeight / img.height)
  const drawWidth = img.width * scale
  const drawHeight = img.height * scale
  const drawX = (targetWidth - drawWidth) / 2
  const drawY = (targetHeight - drawHeight) / 2

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  if (applySharpening) {
    onProgress?.('Applying clarity & sharpening filter...')
    try {
      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
      const data = imageData.data
      const width = targetWidth
      const height = targetHeight
      const copy = new Uint8ClampedArray(data)

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4
          for (let c = 0; c < 3; c++) {
            const center = copy[idx + c]
            const top = copy[((y - 1) * width + x) * 4 + c]
            const bottom = copy[((y + 1) * width + x) * 4 + c]
            const left = copy[(y * width + (x - 1)) * 4 + c]
            const right = copy[(y * width + (x + 1)) * 4 + c]
            const sharp = center * 1.5 - (top + bottom + left + right) * 0.125
            data[idx + c] = Math.min(255, Math.max(0, sharp))
          }
        }
      }
      ctx.putImageData(imageData, 0, 0)
    } catch (e) {
      console.warn('Sharpening filter skipped', e)
    }
  }

  onProgress?.('Exporting 1080p HD image...')
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const quality = format === 'jpeg' ? 0.95 : 1.0

  return await new Promise((res) => canvas.toBlob(res, mimeType, quality))
}

// FFmpeg singleton & callback management
let ffmpegInstance = null
let ffmpegLoadingPromise = null
let ffmpegProgressCallback = null
let ffmpegLogCallback = null

async function getFFmpeg(onStatus, onProgress) {
  ffmpegProgressCallback = onProgress
  ffmpegLogCallback = onStatus

  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance
  }

  if (ffmpegLoadingPromise) {
    return await ffmpegLoadingPromise
  }

  ffmpegLoadingPromise = (async () => {
    onStatus?.('Loading FFmpeg engine (~30MB once, cached in browser)...')
    const ffmpeg = new FFmpeg()

    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)))
      if (ffmpegProgressCallback) {
        ffmpegProgressCallback(pct)
      }
    })

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
      if (ffmpegLogCallback && typeof message === 'string') {
        if (message.includes('frame=') || message.includes('size=')) {
          const stats = message.trim().replace(/\s+/g, ' ')
          ffmpegLogCallback(`Encoding: ${stats}`)
        }
      }
    })

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
    } catch (err) {
      console.warn('Unpkg failed or blocked, trying jsdelivr CDN...', err)
      onStatus?.('Connecting to backup CDN for FFmpeg core...')
      const fallbackURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
    }

    ffmpegInstance = ffmpeg
    return ffmpegInstance
  })()

  try {
    return await ffmpegLoadingPromise
  } catch (err) {
    ffmpegLoadingPromise = null
    throw err
  }
}

// 5. Video Compressor via client-side FFmpeg
async function compressVideoFile(file, preset, customCrf, resolutionCap, onProgress, onStatus) {
  onStatus?.('Initializing FFmpeg WebAssembly engine...')
  const ffmpeg = await getFFmpeg(onStatus, onProgress)

  const inExt = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const uid = Math.random().toString(36).substring(2, 8)
  const inputName = `input_${uid}.${inExt}`
  const outputName = `output_${uid}.mp4`

  onStatus?.('Loading video into memory...')
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  let crf = 28
  let scaleFilter = "scale='min(1280,iw)':-2"

  if (preset === 'balanced') {
    crf = 28
    scaleFilter = "scale='min(1280,iw)':-2"
  } else if (preset === 'space-saver') {
    crf = 32
    scaleFilter = "scale='min(854,iw)':-2"
  } else if (preset === 'hd') {
    crf = 23
    scaleFilter = "scale='min(1920,iw)':-2"
  } else if (preset === 'custom') {
    crf = customCrf || 28
    if (resolutionCap === '1080') scaleFilter = "scale='min(1920,iw)':-2"
    else if (resolutionCap === '720') scaleFilter = "scale='min(1280,iw)':-2"
    else if (resolutionCap === '480') scaleFilter = "scale='min(854,iw)':-2"
    else scaleFilter = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  }

  onStatus?.('Transcoding and compressing video...')
  try {
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ])

    const data = await ffmpeg.readFile(outputName)
    return new Blob([data.buffer], { type: 'video/mp4' })
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}

// 6. Video Converter (MP4, WebM, Animated GIF, MP3 Audio) via client-side FFmpeg
async function convertVideoFile(file, targetFormat, gifFps, gifWidth, mp3Bitrate, onProgress, onStatus) {
  onStatus?.('Initializing FFmpeg WebAssembly engine...')
  const ffmpeg = await getFFmpeg(onStatus, onProgress)

  const inExt = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const uid = Math.random().toString(36).substring(2, 8)
  const inputName = `input_${uid}.${inExt}`
  const targetExt = targetFormat === 'gif' ? 'gif' : targetFormat === 'mp3' ? 'mp3' : targetFormat === 'webm' ? 'webm' : 'mp4'
  const outputName = `output_${uid}.${targetExt}`

  onStatus?.('Loading media into memory...')
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const args = ['-i', inputName]
  let mimeType = 'video/mp4'

  if (targetFormat === 'mp4') {
    mimeType = 'video/mp4'
    args.push(
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName
    )
  } else if (targetFormat === 'webm') {
    mimeType = 'video/webm'
    args.push(
      '-c:v', 'libvpx',
      '-b:v', '1M',
      '-crf', '28',
      '-c:a', 'libvorbis',
      outputName
    )
  } else if (targetFormat === 'gif') {
    mimeType = 'image/gif'
    const fps = gifFps || 12
    const width = gifWidth || 480
    args.push(
      '-vf', `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop', '0',
      outputName
    )
  } else if (targetFormat === 'mp3') {
    mimeType = 'audio/mp3'
    const bitrate = mp3Bitrate || '192k'
    args.push(
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', bitrate,
      outputName
    )
  }

  onStatus?.(`Converting to ${targetFormat.toUpperCase()}...`)
  try {
    await ffmpeg.exec(args)
    const data = await ffmpeg.readFile(outputName)
    return new Blob([data.buffer], { type: mimeType })
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}

function App() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeTool, setActiveTool] = useState('convert')
  const [file, setFile] = useState(null)
  const [quality, setQuality] = useState(82)
  const [format, setFormat] = useState('image/png')
  const [dimensions, setDimensions] = useState({ width: '', height: '' })
  const [pdfPages, setPdfPages] = useState(0)
  const [pdfPreset, setPdfPreset] = useState('balanced')
  
  // Video tool states
  const [videoPreset, setVideoPreset] = useState('balanced') // 'balanced' | 'space-saver' | 'hd' | 'custom'
  const [videoCrf, setVideoCrf] = useState(28)
  const [videoResCap, setVideoResCap] = useState('720')
  const [videoConvertFormat, setVideoConvertFormat] = useState('mp4') // 'mp4' | 'webm' | 'gif' | 'mp3'
  const [gifFps, setGifFps] = useState(12)
  const [gifWidth, setGifWidth] = useState(480)
  const [mp3Bitrate, setMp3Bitrate] = useState('192k')
  const [videoDuration, setVideoDuration] = useState(0)

  // Document & Image tool states
  const [targetMB, setTargetMB] = useState(50)
  const [includePptNotes, setIncludePptNotes] = useState(true)
  const [hdMode, setHdMode] = useState('landscape') // 'landscape' | 'portrait' | 'square' | 'height'
  const [hdSharpen, setHdSharpen] = useState(true)
  const [hdFormat, setHdFormat] = useState('png')

  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  const active = tools.find((tool) => tool.id === activeTool) || tools[0]

  const filteredTools = activeCategory === 'all'
    ? tools
    : tools.filter((t) => t.category === activeCategory)

  const handleToolSelect = (id) => {
    setActiveTool(id)
    setResult(null)
    setProgressText('')
    setProgressPercent(0)
    setFile(null)
  }

  const pickFile = async (files) => {
    const next = files?.[0]
    if (!next) return

    setFile(next)
    setResult(null)
    setProgressText('')
    setProgressPercent(0)
    setDimensions({ width: '', height: '' })
    setPdfPages(0)
    setVideoDuration(0)

    if (next.type.includes('pdf') || next.name.toLowerCase().endsWith('.pdf')) {
      try {
        const buffer = await next.arrayBuffer()
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        setPdfPages(doc.getPageCount())
      } catch {
        setPdfPages(1)
      }
    } else if (next.type.startsWith('image/')) {
      const image = new Image()
      image.onload = () => setDimensions({ width: String(image.width), height: String(image.height) })
      image.src = URL.createObjectURL(next)
    } else if (next.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|wmv|m4v|flv)$/i.test(next.name)) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        setDimensions({ width: String(video.videoWidth || ''), height: String(video.videoHeight || '') })
        setVideoDuration(video.duration || 0)
      }
      video.src = URL.createObjectURL(next)
    }
  }

  // Generic Image Processing (Convert, Resize, Compress)
  const processImage = () => {
    if (!file) return
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const width = activeTool === 'resize' ? Number(dimensions.width) || image.width : image.width
      const height = activeTool === 'resize' ? Number(dimensions.height) || image.height : image.height
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(image, 0, 0, width, height)
      const type = activeTool === 'convert' ? format : 'image/jpeg'
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
          const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
          const filename = `${baseName}-toolbox.${ext}`
          setResult({
            url: URL.createObjectURL(blob),
            blob,
            name: file.name,
            filename,
            size: blob.size,
            type,
          })
        },
        type,
        quality / 100
      )
    }
    image.src = URL.createObjectURL(file)
  }

  // PDF Compressor
  const processPdf = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressText('Starting compression...')
    try {
      const compressedBlob = await compressPdfFile(file, pdfPreset, quality, (msg) => setProgressText(msg))
      const savingsPercent = Math.max(0, Math.round(((file.size - compressedBlob.size) / file.size) * 100))
      const baseName = (file.name || 'document').replace(/\.[^.]+$/, '')
      const filename = `${baseName}-compressed.pdf`
      setResult({
        url: URL.createObjectURL(compressedBlob),
        blob: compressedBlob,
        name: file.name,
        filename,
        size: compressedBlob.size,
        originalSize: file.size,
        savingsPercent,
        type: 'application/pdf',
      })
    } catch (err) {
      console.error(err)
      alert('Could not compress this PDF. Please verify the file is not password-protected.')
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // 1. PDF to Word
  const processPdfToWord = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressText('Converting PDF to Word...')
    try {
      const wordBlob = await convertPdfToWord(file, (msg) => setProgressText(msg))
      const baseName = (file.name || 'document').replace(/\.[^.]+$/, '')
      const filename = `${baseName}.docx`
      setResult({
        url: URL.createObjectURL(wordBlob),
        blob: wordBlob,
        name: file.name,
        filename,
        size: wordBlob.size,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    } catch (err) {
      console.error(err)
      alert('Could not convert this PDF to Word. Please ensure it contains selectable text.')
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // 2. Compress to 50 MB
  const processTargetCompress = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressText(`Compressing to fit under ${targetMB} MB...`)
    try {
      const compressedBlob = await compressToTargetSize(file, targetMB, (msg) => setProgressText(msg))
      const savingsPercent = Math.max(0, Math.round(((file.size - compressedBlob.size) / file.size) * 100))
      const ext = file.name.split('.').pop()
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const filename = `${baseName}-under-${targetMB}MB.${ext}`
      setResult({
        url: URL.createObjectURL(compressedBlob),
        blob: compressedBlob,
        name: file.name,
        filename,
        size: compressedBlob.size,
        originalSize: file.size,
        savingsPercent,
        type: compressedBlob.type,
      })
    } catch (err) {
      console.error(err)
      alert('Could not compress file to target size.')
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // 3. PPT to Word Notes
  const processPptToWord = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressText('Extracting presentation notes...')
    try {
      const wordBlob = await convertPptToWordNotes(file, includePptNotes, (msg) => setProgressText(msg))
      const baseName = (file.name || 'presentation').replace(/\.[^.]+$/, '')
      const filename = `${baseName}-notes.docx`
      setResult({
        url: URL.createObjectURL(wordBlob),
        blob: wordBlob,
        name: file.name,
        filename,
        size: wordBlob.size,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    } catch (err) {
      console.error(err)
      alert('Could not parse PowerPoint file. Please ensure it is a valid .pptx file.')
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // 4. 1080p HD Image Upscaler
  const processHd1080 = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressText('Upscaling and enhancing to 1080p...')
    try {
      const hdBlob = await convertImageTo1080p(file, hdMode, hdSharpen, hdFormat, (msg) => setProgressText(msg))
      const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
      const filename = `${baseName}-1080p.${hdFormat}`
      setResult({
        url: URL.createObjectURL(hdBlob),
        blob: hdBlob,
        name: file.name,
        filename,
        size: hdBlob.size,
        type: hdFormat === 'png' ? 'image/png' : 'image/jpeg',
      })
    } catch (err) {
      console.error(err)
      alert('Could not upscale image to 1080p.')
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // 5. Video Compressor via FFmpeg WASM
  const processVideoCompress = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressPercent(0)
    setProgressText('Starting video compression...')
    try {
      const compressedBlob = await compressVideoFile(
        file,
        videoPreset,
        videoCrf,
        videoResCap,
        (pct) => setProgressPercent(pct),
        (msg) => setProgressText(msg)
      )
      const savingsPercent = Math.max(0, Math.round(((file.size - compressedBlob.size) / file.size) * 100))
      const baseName = (file.name || 'video').replace(/\.[^.]+$/, '')
      const filename = `${baseName}-compressed.mp4`
      setResult({
        url: URL.createObjectURL(compressedBlob),
        blob: compressedBlob,
        name: file.name,
        filename,
        size: compressedBlob.size,
        originalSize: file.size,
        savingsPercent,
        type: 'video/mp4',
        isVideo: true,
      })
    } catch (err) {
      console.error(err)
      alert(`Could not compress video. ${err.message || 'Please verify file format and try again.'}`)
    } finally {
      setIsProcessing(false)
      setProgressText('')
      setProgressPercent(0)
    }
  }

  // 6. Video Converter via FFmpeg WASM
  const processVideoConvert = async () => {
    if (!file) return
    setIsProcessing(true)
    setProgressPercent(0)
    setProgressText(`Preparing conversion to ${videoConvertFormat.toUpperCase()}...`)
    try {
      const convertedBlob = await convertVideoFile(
        file,
        videoConvertFormat,
        gifFps,
        gifWidth,
        mp3Bitrate,
        (pct) => setProgressPercent(pct),
        (msg) => setProgressText(msg)
      )
      const targetExt = videoConvertFormat === 'gif' ? 'gif' : videoConvertFormat === 'mp3' ? 'mp3' : videoConvertFormat === 'webm' ? 'webm' : 'mp4'
      const baseName = (file.name || 'video').replace(/\.[^.]+$/, '')
      const filename = `${baseName}-toolbox.${targetExt}`
      setResult({
        url: URL.createObjectURL(convertedBlob),
        blob: convertedBlob,
        name: file.name,
        filename,
        size: convertedBlob.size,
        type: convertedBlob.type,
        isVideo: videoConvertFormat === 'mp4' || videoConvertFormat === 'webm',
        isAudio: videoConvertFormat === 'mp3',
        isGif: videoConvertFormat === 'gif',
      })
    } catch (err) {
      console.error(err)
      alert(`Could not convert video. ${err.message || 'Please try another format.'}`)
    } finally {
      setIsProcessing(false)
      setProgressText('')
      setProgressPercent(0)
    }
  }

  const handleProcess = () => {
    if (activeTool === 'video-compress') processVideoCompress()
    else if (activeTool === 'video-convert') processVideoConvert()
    else if (activeTool === 'pdf') processPdf()
    else if (activeTool === 'pdf-to-word') processPdfToWord()
    else if (activeTool === 'compress-50mb') processTargetCompress()
    else if (activeTool === 'ppt-to-word') processPptToWord()
    else if (activeTool === 'hd-1080') processHd1080()
    else processImage()
  }

  const getAcceptTypes = () => {
    if (activeTool === 'video-compress' || activeTool === 'video-convert') return 'video/*,.mp4,.webm,.mov,.avi,.mkv,.wmv,.m4v,.flv'
    if (activeTool === 'pdf' || activeTool === 'pdf-to-word') return 'application/pdf,.pdf'
    if (activeTool === 'ppt-to-word') return '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'
    if (activeTool === 'compress-50mb') return 'application/pdf,.pdf,image/*,video/*'
    return 'image/*'
  }

  const getDropzoneSubtitle = () => {
    if (activeTool === 'video-compress') return 'MP4, WebM, MOV, AVI, MKV · Compress file size with client-side FFmpeg'
    if (activeTool === 'video-convert') return 'MP4, WebM, MOV, AVI · Convert to MP4, WebM, animated GIF, or MP3 audio'
    if (activeTool === 'pdf-to-word') return 'PDF documents · Converted to editable Word (.docx)'
    if (activeTool === 'ppt-to-word') return 'PowerPoint (.pptx) · Formatted into Word notes'
    if (activeTool === 'compress-50mb') return 'PDF, Video, or Media files · Fit under 50 MB, 25 MB, or custom target'
    if (activeTool === 'hd-1080') return 'PNG, JPG, WebP · Enhanced & scaled to 1080p Full HD'
    if (activeTool === 'pdf') return 'PDF files · Up to 50MB · 100% Client-Side & Private'
    return 'JPG, PNG or WebP · Max 20MB'
  }

  const getFileBadgeText = () => {
    if (!file) return ''
    const name = file.name.toLowerCase()
    if (name.endsWith('.pdf')) return 'PDF'
    if (name.endsWith('.pptx')) return 'PPTX'
    if (name.endsWith('.docx')) return 'DOCX'
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|wmv|m4v|flv)$/i.test(name)) return 'VIDEO'
    if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(name)) return 'AUDIO'
    if (file.type.includes('png')) return 'PNG'
    if (file.type.includes('webp')) return 'WEBP'
    return 'JPG'
  }

  const getFileBadgeClass = () => {
    const badge = getFileBadgeText()
    if (badge === 'PDF') return 'badge-pdf'
    if (badge === 'PPTX') return 'badge-pptx'
    if (badge === 'DOCX') return 'badge-docx'
    if (badge === 'VIDEO') return 'badge-video'
    if (badge === 'AUDIO') return 'badge-audio'
    return ''
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span>✦</span> toolbox</a>
        <nav>
          <a href="#tools">Tools</a>
          <a href="#how-it-works">How it works</a>
          <a href="#about">About</a>
        </nav>
        <button className="header-button" onClick={() => document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' })}>
          Explore tools <span>→</span>
        </button>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker"><span className="spark">✦</span>SIMPLE ONLINE UTILITIES</p>
            <h1>Small tools.<br /><em>Big relief.</em></h1>
            <p className="hero-text">Fast, private and beautifully simple tools for everyday tasks — now with client-side Video Compressor, Video & Audio Converter, PDF to Word, and 1080p HD.</p>
            <div className="hero-actions">
              <button className="primary" onClick={() => document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' })}>
                Try a tool <span>→</span>
              </button>
              <span className="no-signup">100% private in your browser</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun" />
            <div className="floating-card card-one">
              <span>✦</span><b>Ready in<br />seconds</b>
            </div>
            <div className="floating-card card-two">
              <span>⌁</span><b>Files stay<br />private</b>
            </div>
            <div className="smile">⌒</div>
            <div className="line line-one" />
            <div className="line line-two" />
          </div>
        </section>

        <section id="tools" className="tools-section">
          <div className="section-title">
            <p className="kicker">PICK A TOOL</p>
            <h2>Made for getting it done.</h2>
          </div>

          <div className="tool-filters">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`filter-pill ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="tool-grid">
            {filteredTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolSelect(tool.id)}
                className={`tool-card ${activeTool === tool.id ? 'selected' : ''}`}
              >
                <span className={`tool-icon ${tool.iconClass}`}>{tool.icon}</span>
                <strong>{tool.title}</strong>
                <span>{tool.text}</span>
                <i>→</i>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace">
          <div className="workspace-heading">
            <p className="kicker">{active.title.toUpperCase()}</p>
            <h2>Drop it here, we’ll handle the rest.</h2>
          </div>

          {activeTool === 'qr' ? (
            <QrTool />
          ) : (
            <>
              {!file ? (
                <label
                  className="drop-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    pickFile(event.dataTransfer.files)
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept={getAcceptTypes()}
                    onChange={(event) => pickFile(event.target.files)}
                  />
                  <span className="upload-mark">↑</span>
                  <strong>
                    {activeTool === 'video-compress'
                      ? 'Drop your video here to compress'
                      : activeTool === 'video-convert'
                      ? 'Drop your video here to convert'
                      : activeTool === 'pdf' || activeTool === 'pdf-to-word'
                      ? 'Drop your PDF here'
                      : activeTool === 'ppt-to-word'
                      ? 'Drop your PowerPoint (.pptx) here'
                      : activeTool === 'compress-50mb'
                      ? 'Drop your file here (under 50MB target)'
                      : activeTool === 'hd-1080'
                      ? 'Drop your image for 1080p HD'
                      : 'Drop your image here'}
                  </strong>
                  <span>or <u>browse files</u> from your device</span>
                  <small>{getDropzoneSubtitle()}</small>
                </label>
              ) : (
                <div className="editor">
                  <div className="file-row">
                    <div className={`file-badge ${getFileBadgeClass()}`}>
                      {getFileBadgeText()}
                    </div>
                    <div>
                      <strong>{file.name}</strong>
                      <span>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                        {videoDuration > 0 ? ` · ${Math.floor(videoDuration / 60)}:${String(Math.floor(videoDuration % 60)).padStart(2, '0')}` : ''}
                        {pdfPages > 0 ? ` · ${pdfPages} page${pdfPages > 1 ? 's' : ''}` : ''}
                        {dimensions.width ? ` · ${dimensions.width} × ${dimensions.height}px` : ''}
                      </span>
                    </div>
                    <button className="remove" onClick={() => { setFile(null); setResult(null); setProgressText(''); setProgressPercent(0); }}>
                      ×
                    </button>
                  </div>

                  <div className="options">
                    {/* Video Compressor */}
                    {activeTool === 'video-compress' && (
                      <>
                        <div className="pdf-presets-container">
                          <span className="preset-title">Compression Preset</span>
                          <div className="preset-group">
                            <button
                              type="button"
                              className={`preset-btn ${videoPreset === 'balanced' ? 'active' : ''}`}
                              onClick={() => { setVideoPreset('balanced'); setResult(null); }}
                            >
                              <b>Balanced 720p (Recommended)</b>
                              <small>Up to 70% smaller · Sharp & easy to share</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoPreset === 'space-saver' ? 'active' : ''}`}
                              onClick={() => { setVideoPreset('space-saver'); setResult(null); }}
                            >
                              <b>Space Saver 480p</b>
                              <small>Maximum reduction · Fits email & Discord</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoPreset === 'hd' ? 'active' : ''}`}
                              onClick={() => { setVideoPreset('hd'); setResult(null); }}
                            >
                              <b>High Quality 1080p</b>
                              <small>Crisp Full HD · Modest size reduction</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoPreset === 'custom' ? 'active' : ''}`}
                              onClick={() => { setVideoPreset('custom'); setResult(null); }}
                            >
                              <b>Custom Tuning</b>
                              <small>Adjust CRF slider & resolution cap</small>
                            </button>
                          </div>
                        </div>

                        {videoPreset === 'custom' && (
                          <div style={{ display: 'flex', gap: '20px', width: '100%', flexWrap: 'wrap', marginTop: '10px' }}>
                            <label className="range-label">
                              Compression Factor (CRF) <b>{videoCrf}</b> (18 = Highest Quality, 36 = Smallest)
                              <input
                                type="range"
                                min="18"
                                max="36"
                                value={videoCrf}
                                onChange={(e) => { setVideoCrf(Number(e.target.value)); setResult(null); }}
                              />
                            </label>
                            <label>
                              Max Resolution
                              <select value={videoResCap} onChange={(e) => { setVideoResCap(e.target.value); setResult(null); }}>
                                <option value="original">Original Dimensions</option>
                                <option value="1080">Cap at 1080p</option>
                                <option value="720">Cap at 720p</option>
                                <option value="480">Cap at 480p</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </>
                    )}

                    {/* Video Converter */}
                    {activeTool === 'video-convert' && (
                      <>
                        <div className="pdf-presets-container">
                          <span className="preset-title">Target Output Format</span>
                          <div className="preset-group">
                            <button
                              type="button"
                              className={`preset-btn ${videoConvertFormat === 'mp4' ? 'active' : ''}`}
                              onClick={() => { setVideoConvertFormat('mp4'); setResult(null); }}
                            >
                              <b>MP4 Video (H.264)</b>
                              <small>Universal playback on all phones & web</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoConvertFormat === 'webm' ? 'active' : ''}`}
                              onClick={() => { setVideoConvertFormat('webm'); setResult(null); }}
                            >
                              <b>WebM Video</b>
                              <small>Modern open HTML5 web video</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoConvertFormat === 'gif' ? 'active' : ''}`}
                              onClick={() => { setVideoConvertFormat('gif'); setResult(null); }}
                            >
                              <b>Animated GIF</b>
                              <small>High quality 2-pass looping animation</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${videoConvertFormat === 'mp3' ? 'active' : ''}`}
                              onClick={() => { setVideoConvertFormat('mp3'); setResult(null); }}
                            >
                              <b>Extract MP3 Audio</b>
                              <small>Rip sound track to high quality MP3</small>
                            </button>
                          </div>
                        </div>

                        {videoConvertFormat === 'gif' && (
                          <div style={{ display: 'flex', gap: '20px', width: '100%', flexWrap: 'wrap', marginTop: '12px' }}>
                            <label>
                              GIF Frame Rate
                              <select value={gifFps} onChange={(e) => { setGifFps(Number(e.target.value)); setResult(null); }}>
                                <option value={10}>10 FPS (Smallest file)</option>
                                <option value={12}>12 FPS (Balanced - recommended)</option>
                                <option value={15}>15 FPS (Smooth)</option>
                                <option value={20}>20 FPS (Very smooth)</option>
                              </select>
                            </label>
                            <label>
                              Max Width
                              <select value={gifWidth} onChange={(e) => { setGifWidth(Number(e.target.value)); setResult(null); }}>
                                <option value={360}>360px (Compact)</option>
                                <option value={480}>480px (Standard - recommended)</option>
                                <option value={640}>640px (High definition)</option>
                              </select>
                            </label>
                          </div>
                        )}

                        {videoConvertFormat === 'mp3' && (
                          <div style={{ display: 'flex', gap: '20px', width: '100%', flexWrap: 'wrap', marginTop: '12px' }}>
                            <label>
                              Audio Bitrate
                              <select value={mp3Bitrate} onChange={(e) => { setMp3Bitrate(e.target.value); setResult(null); }}>
                                <option value="128k">128 kbps (Standard speech & podcasts)</option>
                                <option value="192k">192 kbps (High quality music & stereo)</option>
                                <option value="320k">320 kbps (Maximum fidelity)</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </>
                    )}

                    {/* Convert */}
                    {activeTool === 'convert' && (
                      <label>
                        Convert to
                        <select value={format} onChange={(event) => setFormat(event.target.value)}>
                          <option value="image/png">PNG</option>
                          <option value="image/jpeg">JPG</option>
                          <option value="image/webp">WebP</option>
                        </select>
                      </label>
                    )}

                    {/* Resize */}
                    {activeTool === 'resize' && (
                      <>
                        <label>
                          Width (px)
                          <input
                            value={dimensions.width}
                            onChange={(event) => setDimensions({ ...dimensions, width: event.target.value })}
                          />
                        </label>
                        <label>
                          Height (px)
                          <input
                            value={dimensions.height}
                            onChange={(event) => setDimensions({ ...dimensions, height: event.target.value })}
                          />
                        </label>
                      </>
                    )}

                    {/* Compress */}
                    {activeTool === 'compress' && (
                      <label className="range-label">
                        Quality <b>{quality}%</b>
                        <input
                          type="range"
                          min="20"
                          max="100"
                          value={quality}
                          onChange={(event) => setQuality(Number(event.target.value))}
                        />
                      </label>
                    )}

                    {/* PDF Compressor */}
                    {activeTool === 'pdf' && (
                      <>
                        <div className="pdf-presets-container">
                          <span className="preset-title">Compression Level</span>
                          <div className="preset-group">
                            <button
                              type="button"
                              className={`preset-btn ${pdfPreset === 'balanced' ? 'active' : ''}`}
                              onClick={() => { setPdfPreset('balanced'); setQuality(75); setResult(null); }}
                            >
                              <b>Balanced (Recommended)</b>
                              <small>Crisp text, up to 60-70% smaller</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${pdfPreset === 'extreme' ? 'active' : ''}`}
                              onClick={() => { setPdfPreset('extreme'); setQuality(50); setResult(null); }}
                            >
                              <b>Extreme Compression</b>
                              <small>Smallest size for email & uploads</small>
                            </button>
                            <button
                              type="button"
                              className={`preset-btn ${pdfPreset === 'lossless' ? 'active' : ''}`}
                              onClick={() => { setPdfPreset('lossless'); setResult(null); }}
                            >
                              <b>Vector / Stream Clean</b>
                              <small>Lossless structure optimization</small>
                            </button>
                          </div>
                        </div>

                        {pdfPreset !== 'lossless' && (
                          <label className="range-label" style={{ marginTop: '10px' }}>
                            Quality Level <b>{quality}%</b>
                            <input
                              type="range"
                              min="25"
                              max="95"
                              value={quality}
                              onChange={(event) => { setQuality(Number(event.target.value)); setResult(null); }}
                            />
                          </label>
                        )}
                      </>
                    )}

                    {/* PDF to Word */}
                    {activeTool === 'pdf-to-word' && (
                      <div className="pdf-presets-container">
                        <span className="preset-title">Export Format</span>
                        <div className="preset-group">
                          <button type="button" className="preset-btn active">
                            <b>Microsoft Word (.docx)</b>
                            <small>Editable document with headings & paragraphs</small>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Target 50MB Compressor */}
                    {activeTool === 'compress-50mb' && (
                      <div className="pdf-presets-container">
                        <span className="preset-title">Target Size Limit</span>
                        <div className="preset-group">
                          <button
                            type="button"
                            className={`preset-btn ${targetMB === 50 ? 'active' : ''}`}
                            onClick={() => { setTargetMB(50); setResult(null); }}
                          >
                            <b>50 MB Limit</b>
                            <small>Discord, Slack & Portal uploads</small>
                          </button>
                          <button
                            type="button"
                            className={`preset-btn ${targetMB === 25 ? 'active' : ''}`}
                            onClick={() => { setTargetMB(25); setResult(null); }}
                          >
                            <b>25 MB Limit</b>
                            <small>Email attachments (Gmail, Outlook)</small>
                          </button>
                          <button
                            type="button"
                            className={`preset-btn ${targetMB === 10 ? 'active' : ''}`}
                            onClick={() => { setTargetMB(10); setResult(null); }}
                          >
                            <b>10 MB Limit</b>
                            <small>Strict web forms & LMS limits</small>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* PPT to Word Notes */}
                    {activeTool === 'ppt-to-word' && (
                      <div className="pdf-presets-container">
                        <span className="preset-title">Notes Configuration</span>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={includePptNotes}
                            onChange={(e) => setIncludePptNotes(e.target.checked)}
                          />
                          Extract Speaker & Presenter Notes
                        </label>
                      </div>
                    )}

                    {/* 1080p HD Upscaler */}
                    {activeTool === 'hd-1080' && (
                      <div className="pdf-presets-container">
                        <span className="preset-title">1080p Resolution Mode</span>
                        <div className="preset-group">
                          <button
                            type="button"
                            className={`preset-btn ${hdMode === 'landscape' ? 'active' : ''}`}
                            onClick={() => { setHdMode('landscape'); setResult(null); }}
                          >
                            <b>1920 × 1080 (16:9 Landscape)</b>
                            <small>Full HD desktop, video & wallpaper</small>
                          </button>
                          <button
                            type="button"
                            className={`preset-btn ${hdMode === 'portrait' ? 'active' : ''}`}
                            onClick={() => { setHdMode('portrait'); setResult(null); }}
                          >
                            <b>1080 × 1920 (9:16 Portrait)</b>
                            <small>Stories, Reels, TikTok & mobile</small>
                          </button>
                          <button
                            type="button"
                            className={`preset-btn ${hdMode === 'square' ? 'active' : ''}`}
                            onClick={() => { setHdMode('square'); setResult(null); }}
                          >
                            <b>1080 × 1080 (1:1 Square)</b>
                            <small>Social posts, avatars & products</small>
                          </button>
                          <button
                            type="button"
                            className={`preset-btn ${hdMode === 'height' ? 'active' : ''}`}
                            onClick={() => { setHdMode('height'); setResult(null); }}
                          >
                            <b>1080px Height (Auto-Ratio)</b>
                            <small>Exact height, natural aspect ratio</small>
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={hdSharpen}
                              onChange={(e) => setHdSharpen(e.target.checked)}
                            />
                            Apply Smart Clarity & Sharpening Filter
                          </label>

                          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                            <span>Format:</span>
                            <select value={hdFormat} onChange={(e) => setHdFormat(e.target.value)}>
                              <option value="png">PNG (Lossless High Quality)</option>
                              <option value="jpeg">JPG (Full HD 95%)</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {isProcessing && (
                    <div style={{ width: '100%', marginBottom: '18px' }}>
                      <div className="progress-container">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${Math.max(6, progressPercent)}%` }}
                        />
                      </div>
                      <div className="progress-info">
                        <span>{progressText || 'Processing with client-side FFmpeg...'}</span>
                        <span>{progressPercent > 0 ? <b>{progressPercent}%</b> : ''}</span>
                      </div>
                    </div>
                  )}

                  {!result ? (
                    <button
                      className="primary process"
                      disabled={isProcessing}
                      onClick={handleProcess}
                    >
                      {isProcessing ? (
                        <>
                          <span className="spinner">◌</span> {progressPercent > 0 ? `${progressPercent}%` : 'Processing...'}
                        </>
                      ) : (
                        <>
                          {activeTool === 'video-compress'
                            ? 'Compress Video'
                            : activeTool === 'video-convert'
                            ? (videoConvertFormat === 'mp3' ? 'Extract MP3 Audio' : videoConvertFormat === 'gif' ? 'Convert to GIF' : `Convert to ${videoConvertFormat.toUpperCase()}`)
                            : activeTool === 'pdf-to-word'
                            ? 'Convert to Word (.docx)'
                            : activeTool === 'ppt-to-word'
                            ? 'Generate Word Notes (.docx)'
                            : activeTool === 'compress-50mb'
                            ? `Compress to under ${targetMB} MB`
                            : activeTool === 'hd-1080'
                            ? 'Generate 1080p HD Image'
                            : activeTool === 'pdf'
                            ? 'Compress PDF'
                            : activeTool === 'compress'
                            ? 'Compress image'
                            : activeTool === 'resize'
                            ? 'Resize image'
                            : 'Convert image'} <span>→</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="result">
                      <span>✓</span>
                      <div style={{ flex: 1 }}>
                        <strong>Your file is ready!</strong>
                        <small>
                          {(result.size / 1024 / 1024).toFixed(2)} MB output
                          {result.savingsPercent > 0 && (
                            <span className="savings-badge">-{result.savingsPercent}% smaller</span>
                          )}
                          {result.savingsPercent === 0 && (
                            <span className="savings-badge">Ready</span>
                          )}
                        </small>
                        {result.isVideo && (
                          <video
                            src={result.url}
                            controls
                            style={{ maxWidth: '100%', maxHeight: '200px', marginTop: '10px', borderRadius: '4px', display: 'block' }}
                          />
                        )}
                        {result.isAudio && (
                          <audio
                            src={result.url}
                            controls
                            style={{ width: '100%', marginTop: '10px', display: 'block' }}
                          />
                        )}
                        {result.isGif && (
                          <img
                            src={result.url}
                            alt="Converted GIF"
                            style={{ maxWidth: '100%', maxHeight: '200px', marginTop: '10px', borderRadius: '4px', display: 'block' }}
                          />
                        )}
                      </div>
                      <div className="download-actions">
                        <a
                          className="download"
                          href={result.url}
                          download={result.filename || 'toolbox-output'}
                        >
                          Download {result.filename?.endsWith('.docx') ? 'Word Doc ↓' : result.isVideo ? 'Video ↓' : result.isAudio ? 'Audio ↓' : result.isGif ? 'GIF ↓' : 'File ↓'}
                        </a>
                        <a
                          className="view-link"
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open directly in a new tab to view or save"
                        >
                          Open in tab ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section id="how-it-works" className="steps">
          <div>
            <p className="kicker">HOW IT WORKS</p>
            <h2>Nothing complicated.</h2>
          </div>
          <ol>
            <li><b>01</b><span>Choose the tool you need from the catalog.</span></li>
            <li><b>02</b><span>Add your file and configure your options.</span></li>
            <li><b>03</b><span>Download your finished file directly to your device.</span></li>
          </ol>
        </section>
      </main>

      <footer id="about">
        <a className="brand" href="#top"><span>✦</span> toolbox</a>
        <p>Practical tools, thoughtfully made.</p>
        <span>© 2026 toolbox</span>
      </footer>
    </div>
  )
}

function QrTool() {
  const [text, setText] = useState('https://example.com')
  const [qrUrl, setQrUrl] = useState('')

  const createQr = async () => {
    if (!text.trim()) return
    setQrUrl(await QRCode.toDataURL(text, { width: 560, margin: 2, color: { dark: '#173b30', light: '#fffdf9' } }))
  }

  return (
    <div className="qr-tool">
      <div className="qr-preview">
        {qrUrl ? (
          <img
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            src={qrUrl}
            alt={`QR code for ${text}`}
          />
        ) : (
          '▦'
        )}
      </div>
      <div>
        <label>
          Link or text
          <input
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setQrUrl('')
            }}
          />
        </label>
        {qrUrl ? (
          <div className="download-actions" style={{ marginTop: '16px' }}>
            <a
              className="primary"
              href={qrUrl}
              download="toolbox-qr-code.png"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Download QR <span>↓</span>
            </a>
            <a
              className="view-link"
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open ↗
            </a>
          </div>
        ) : (
          <button className="primary" onClick={createQr}>
            Generate QR <span>→</span>
          </button>
        )}
        <small>{qrUrl ? 'Your QR code is ready to download.' : 'Enter a link or message, then generate.'}</small>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
