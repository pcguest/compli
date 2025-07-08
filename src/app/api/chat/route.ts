import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required and must be an array.' }, { status: 400 })
    }

    const llmClient = getLLMClient()
    const response = await llmClient.chat(messages)

    return NextResponse.json({ response }, { status: 200 })
  } catch (error: any) {
    console.error('Error during LLM chat:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
