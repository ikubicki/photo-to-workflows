import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { analyzeWorkflow } from './workflow.js'

const app = Fastify({ logger: true })

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

app.post('/api/analyze', async (request, reply) => {
  const file = await request.file()

  if (!file) {
    return reply.status(400).send({ error: 'No image file provided' })
  }

  const mimeType = file.mimetype
  if (!mimeType.startsWith('image/')) {
    return reply.status(400).send({ error: 'File must be an image' })
  }

  const buffer = await file.toBuffer()
  const imageBase64 = buffer.toString('base64')
  const result = await analyzeWorkflow(imageBase64, mimeType)
  return result
})

const PORT = Number(process.env.PORT ?? 4000)
await app.listen({ port: PORT })
console.log(`Backend running on http://localhost:${PORT}`)
