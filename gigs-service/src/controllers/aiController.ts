
import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Fast and free-tier eligible

export class AIController {
    /**
     * Rephrase text to be more professional and engaging
     */
    static async rephraseText(req: Request, res: Response): Promise<void> {
        try {
            const { text } = req.body;

            if (!text) {
                res.status(400).json({
                    success: false,
                    message: "Text is required"
                });
                return;
            }

            if (!process.env.GEMINI_API_KEY) {
                console.error("GEMINI_API_KEY is missing");
                res.status(500).json({
                    success: false,
                    message: "AI service is not configured (Missing API Key). Please contact administrator."
                });
                return;
            }

            const prompt = `Rephrase the following text to be professional, engaging, and suitable for a job posting description or gig details. Keep the tone enthusiastic but clear. Return ONLY the rephrased text without quotes or preamble.\n\nOriginal Text:\n"${text}"`;

            // Helper function for retrying requests
            const generateContentWithRetry = async (promptText: string, retries = 3, delay = 1000): Promise<string> => {
                try {
                    const result = await model.generateContent(promptText);
                    const response = await result.response;
                    return response.text().trim();
                } catch (error: any) {
                    if (retries > 0 && (error.message.includes('429') || error.status === 429)) {
                        console.log(`Rate limit hit, retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return generateContentWithRetry(promptText, retries - 1, delay * 2);
                    }
                    throw error;
                }
            };

            const rephrasedText = await generateContentWithRetry(prompt);

            res.status(200).json({
                success: true,
                data: {
                    original: text,
                    rephrased: rephrasedText
                }
            });
        } catch (error: any) {
            console.error("AI Rephrase Error:", error);

            // Provide a more specific error message to the client
            let errorMessage = "Failed to process AI request";
            if (error.message.includes('429') || error.status === 429) {
                errorMessage = "AI service is currently busy (Rate Limit Exceeded). Please try again in a moment.";
            }

            res.status(500).json({
                success: false,
                message: errorMessage,
                error: error.message
            });
        }
    }
}
