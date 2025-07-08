import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

// Define types for clarity and future expansion
type AnalysisRequest = {
  document_id: string;
  model?: 'openai' | 'claude' | 'mistral' | string; // Allow custom models
  apiKey?: string;
};

type AnalysisResponse = {
  analysis_result: string;
  confidence_score: number;
  tips?: string[];
  human_verification_prompt?: string;
};

// In-memory store for rate limiting (NOT suitable for multi-instance deployments)
// For a production environment, consider a distributed cache like Redis or a dedicated rate-limiting service.
const userRequestCounts = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute

const applyRateLimiting = async (userId: string | undefined): Promise<boolean> => {
  if (!userId) {
    // For unauthenticated requests, you might want to apply a stricter global limit
    // or simply deny access to this endpoint.
    return false; // Deny unauthenticated requests for this example
  }

  const now = Date.now();
  let userEntry = userRequestCounts.get(userId);

  if (!userEntry || (now - userEntry.lastReset > RATE_LIMIT_WINDOW_MS)) {
    // Reset count if window expired or new user
    userEntry = { count: 1, lastReset: now };
    userRequestCounts.set(userId, userEntry);
    return true;
  }

  if (userEntry.count < MAX_REQUESTS_PER_WINDOW) {
    userEntry.count++;
    userRequestCounts.set(userId, userEntry);
    return true;
  }

  // Rate limit exceeded
  console.warn(`Rate limit exceeded for user: ${userId}`);
  return false;
};

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Apply rate limiting
  const isAllowed = await applyRateLimiting(user.id);
  if (!isAllowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const { document_id, model = 'openai', apiKey }: AnalysisRequest = await request.json();

  if (!document_id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  // 1. Retrieve file metadata and verify ownership
  const { data: document, error: dbError } = await supabase
    .from('documents')
    .select('file_name')
    .eq('id', document_id)
    .eq('user_id', user.id)
    .single();

  if (dbError || !document) {
    console.error('Supabase DB Fetch Error or Document Not Found:', dbError);
    return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
  }

  let analysisResult: AnalysisResponse;
  let modelUsed = model;
  let documentContent: string | null = null;

  try {
    // Fetch document from Supabase Storage
    const fileExt = document.file_name.split('.').pop();
    const fileNameInStorage = `${document_id}.${fileExt}`;
    const filePathInStorage = `${user.id}/${fileNameInStorage}`;

    const { data: fileBlob, error: storageError } = await supabase.storage
      .from('documents')
      .download(filePathInStorage);

    if (storageError || !fileBlob) {
      console.error('Supabase Storage Download Error:', storageError);
      throw new Error(`Failed to download document: ${storageError?.message || 'Unknown error'}`);
    }

    // Extract content based on file type
    if (fileExt === 'txt') {
      documentContent = await fileBlob.text();
    } else if (fileExt === 'pdf') {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const pdf = await pdfParse(Buffer.from(arrayBuffer));
      documentContent = pdf.text;
    } else {
      throw new Error('Unsupported file type for analysis. Only .txt and .pdf are supported.');
    }

    if (!documentContent) {
      throw new Error('Could not extract content from document.');
    }

    // 2. Call external AI API based on model
    const externalApiKey = apiKey || process.env.OPENAI_API_KEY; // Default to OpenAI key

    if (!externalApiKey) {
      throw new Error('API key not provided for external model. Please set OPENAI_API_KEY in your environment variables or provide it in the request body.');
    }

    const prompt = `Analyze the legal document below. Provide a concise summary of its key legal implications and any potential risks. Document content:\n\n${documentContent}`;

    switch (model) {
      case 'openai':
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${externalApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4', // You can make this configurable via environment variable if needed
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!openaiResponse.ok) {
          const errorBody = await openaiResponse.json();
          console.error('OpenAI API error response:', errorBody);
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorBody.error?.message || openaiResponse.statusText}`);
        }

        const openaiData = await openaiResponse.json();
        analysisResult = {
          analysis_result: openaiData.choices[0].message.content,
          confidence_score: 0.95 // Placeholder, could be derived from model output if available
        };
        break;
      case 'claude':
        // Placeholder for Claude API integration.
        // Recommended: Use the @anthropic-ai/sdk for a robust integration.
        // Example:
        // import Anthropic from '@anthropic-ai/sdk';
        // const anthropic = new Anthropic({ apiKey: externalApiKey });
        // const claudeResponse = await anthropic.messages.create({
        //   model: "claude-3-opus-20240229", // Or other Claude model
        //   max_tokens: 1024,
        //   messages: [{ role: "user", content: prompt }],
        // });
        // analysisResult = { analysis_result: claudeResponse.content[0].text, confidence_score: 0.90 };
        analysisResult = { analysis_result: `Analysis of ${document.file_name} by Claude. (Integration pending)`, confidence_score: 0.90 };
        break;
      case 'mistral':
        // Placeholder for Mistral API integration.
        // Recommended: Use the mistralai/mistralai SDK for a robust integration.
        // Example:
        // import MistralClient from '@mistralai/mistralai';
        // const mistral = new MistralClient(externalApiKey);
        // const mistralResponse = await mistral.chat({
        //    model: 'mistral-large-latest', // Or other Mistral model
        //    messages: [{ role: 'user', content: prompt }],
        // });
        // analysisResult = { analysis_result: mistralResponse.choices[0].message.content, confidence_score: 0.88 };
        analysisResult = { analysis_result: `Analysis of ${document.file_name} by Mistral. (Integration pending)`, confidence_score: 0.88 };
        break;
      default:
        // Handle other or custom models
        analysisResult = { analysis_result: `Analysis of ${document.file_name} by custom model ${model}.`, confidence_score: 0.80 };
        break;
    }
  } catch (error: any) {
    console.error(`Error during document processing or external AI model call (${model}):`, error);
    // 3. Fallback flow
    modelUsed = 'fallback';
    analysisResult = {
      analysis_result: "Could not analyze your file due to an external API issue or document processing error. Here's what to try next:",
      confidence_score: 0.5,
      tips: [
        "Ensure your API key is correct and has sufficient credits.",
        "Try again later, as the external service might be temporarily unavailable.",
        "Ensure the document is a valid .txt or .pdf file.",
        "Consider uploading a different file format if the issue persists.",
      ],
      human_verification_prompt: "Please review the document manually for key legal clauses or consult a legal professional.",
    };
  }

  // 4. Secure logging to Supabase
  const { error: logError } = await supabase
    .from('analysis_logs')
    .insert({
      user_id: user.id,
      file_id: document_id,
      model_used: modelUsed,
    });

  if (logError) {
    console.error('Error logging analysis request:', logError);
    // Do not block the user response if logging fails
  }

  return NextResponse.json(analysisResult);
}