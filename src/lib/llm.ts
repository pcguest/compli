import OpenAI from 'openai';
// import Anthropic from '@anthropic-ai/sdk'; // Uncomment if you decide to use Anthropic
// import { GoogleGenerativeAI } from '@google/generative-ai'; // Uncomment if you decide to use Google Gemini

interface LLMClient {
  chat: (messages: { role: string; content: string }[]) => Promise<string>;
}

class OpenAIClient implements LLMClient {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o as it's the latest and most capable
      messages: messages as any, // Type assertion for compatibility
    });
    return completion.choices[0].message?.content || "";
  }
}

// Uncomment and implement if you decide to use Anthropic
// class AnthropicClient implements LLMClient {
//   private anthropic: Anthropic;

//   constructor(apiKey: string) {
//     this.anthropic = new Anthropic({ apiKey });
//   }

//   async chat(messages: { role: string; content: string }[]): Promise<string> {
//     const response = await this.anthropic.messages.create({
//       model: "claude-3-opus-20240229", // Or other Claude model
//       max_tokens: 1024,
//       messages: messages,
//     });
//     return response.content[0].text || "";
//   }
// }

// Uncomment and implement if you decide to use Google Gemini
// class GoogleGeminiClient implements LLMClient {
//   private genAI: GoogleGenerativeAI;

//   constructor(apiKey: string) {
//     this.genAI = new GoogleGenerativeAI(apiKey);
//   }

//   async chat(messages: { role: string; content: string }[]): Promise<string> {
//     const model = this.genAI.getGenerativeModel({ model: "gemini-pro" }); // Or other Gemini model
//     const result = await model.generateContent({
//       contents: messages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }))
//     });
//     const response = result.response;
//     return response.text();
//   }
// }

export function getLLMClient(): LLMClient {
  if (process.env.OPENAI_API_KEY) {
    console.log("Using OpenAI LLM client.");
    return new OpenAIClient(process.env.OPENAI_API_KEY);
  } 
  // else if (process.env.ANTHROPIC_API_KEY) {
  //   console.log("Using Anthropic LLM client.");
  //   return new AnthropicClient(process.env.ANTHROPIC_API_KEY);
  // } else if (process.env.GOOGLE_API_KEY) {
  //   console.log("Using Google Gemini LLM client.");
  //   return new GoogleGeminiClient(process.env.GOOGLE_API_KEY);
  // } 
  else {
    throw new Error("No LLM API key found in environment variables. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY.");
  }
}
