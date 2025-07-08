import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

interface Payload {
  email: string;
  fileName: string;
  resultText: string; // For successful analysis summary
  isFallback: boolean; // True if fallback was used
  confidenceScore?: number; // Optional, for fallback
  fallbackTips?: string[]; // Optional, for fallback
  humanVerificationPrompt?: string; // Optional, for fallback
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { email, fileName, resultText, isFallback, confidenceScore, fallbackTips, humanVerificationPrompt }: Payload = await req.json();

    if (!email || !fileName || !resultText) {
      return new Response("Missing required payload fields (email, fileName, resultText).", { status: 400 });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response("Resend API key not set in environment variables.", { status: 500 });
    }

    let subject: string;
    let htmlContent: string;

    if (isFallback) {
      subject = `Action Required: Analysis for '${fileName}' Used Fallback`;
      htmlContent = `
        <p>Dear User,</p>
        <p>We wanted to inform you that the analysis for your document <strong>'${fileName}'</strong> was completed, but our system had to use a fallback mechanism.</p>
        <p>This typically happens if the external AI model was unavailable or encountered an issue. The analysis provided is a general response, not specific to your document's content.</p>
        <p><strong>Confidence Score:</strong> ${confidenceScore ? (confidenceScore * 100).toFixed(0) + '%' : 'N/A'}</p>
        ${fallbackTips && fallbackTips.length > 0 ? `
          <p><strong>Tips for next time:</strong></p>
          <ul>
            ${fallbackTips.map(tip => `<li>${tip}</li>`).join('')}
          </ul>
        ` : ''}
        ${humanVerificationPrompt ? `<p><strong>Human Verification Prompt:</strong> ${humanVerificationPrompt}</p>` : ''}
        <p>We recommend reviewing the document manually or trying the analysis again later.</p>
        <p>Best regards,</p>
        <p>The Compli Team</p>
      `;
    } else {
      subject = `Analysis Complete: Your Document '${fileName}' is Ready`;
      htmlContent = `
        <p>Dear User,</p>
        <p>We are pleased to inform you that your document <strong>'${fileName}'</strong> has been successfully analysed.</p>
        <p><strong>Analysis Summary:</strong></p>
        <p>${resultText}</p>
        <p>You can view the full details and any further insights within the Compli application.</p>
        <p>Best regards,</p>
        <p>The Compli Team</p>
      `;
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // Replace with your verified Resend sender email
        to: email,
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json();
      console.error("Resend API Error:", errorData);
      return new Response(`Failed to send email: ${errorData.message || resendResponse.statusText}`, { status: 500 });
    }

    return new Response("Email sent successfully!", { status: 200 });
  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
  }
});