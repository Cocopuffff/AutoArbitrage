import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';

const VehicleDataSchema = z.object({
    price: z.number().describe('The asking price in SGD. Remove commas and currency symbols.'),
    mileage: z.number().nullable().describe('The mileage in km. Extract as a number. Null if not found.'),
    year: z.number().nullable().describe('The manufacturing or registration year. Null if not found.'),
    parf_rebate: z.number().nullable().describe('The PARF rebate amount if specified. Null if not found.'),
    remaining_lease: z.number().nullable().describe('The remaining years on COE (Singapore). Extract as a number. Null if not found.'),
    description: z.string().describe('The full dealer description or notes provided about the car.'),
});

export type ExtractedVehicleData = z.infer<typeof VehicleDataSchema>;

function getModel() {
    const provider = process.env.AI_PROVIDER || 'google';
    switch (provider) {
        case 'google':
            const google = createGoogleGenerativeAI({
                apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
            });
            return google('gemini-2.5-flash');
        case 'openai':
            const openai = createOpenAI({
                apiKey: process.env.OPENAI_API_KEY || '',
            });
            return openai('gpt-4o');
        case 'deepseek':
            const deepseek = createDeepSeek({
                apiKey: process.env.DEEPSEEK_API_KEY || '',
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                }
            });
            return deepseek('deepseek-chat');
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
}

export async function parseListingWithLLM(rawText: string, url: string): Promise<ExtractedVehicleData | null> {
    try {
        const { output } = await generateText({
            model: getModel(),
            output: Output.object({
                schema: VehicleDataSchema,
            }),
            prompt: `You are an expert automotive data extraction agent.
      I will provide you with the raw text scraped from a used car listing in Singapore.
      Your job is to extract the exact price, mileage, year, PARF rebate, remaining lease (COE), and the full description text into valid JSON.
      
      URL: ${url}
      
      Raw Text:
      ${rawText}
      `,
        });

        return output;
    } catch (error) {
        console.error(`Failed to parse listing with LLM for ${url}:`, error);
        return null;
    }
}
