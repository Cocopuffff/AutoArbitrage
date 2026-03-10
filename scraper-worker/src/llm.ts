import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';

const VehicleDataSchema = z.object({
    price: z.number().nullable().describe('The asking price in SGD. Remove commas and currency symbols. Null if "Sold" or not found.'),
    is_sold: z.boolean().describe('Set to true if the listing clearly indicates the car is sold.'),
    mileage: z.number().nullable().describe('The mileage in km. Extract as a number. Null if not found.'),
    year: z.number().nullable().describe('The manufacturing year, typically found after "Manufactured" or make and model. Null if not found.'),
    registration_date: z.string().nullable().describe('The registration date labeled "Reg Date" in dd-MMM-yyyy format (e.g. 15-Jan-2020). Null if not found.'),
    parf_rebate: z.number().nullable().describe('The PARF rebate amount if specified. Null if not found.'),
    remaining_lease: z.number().nullable().describe('The remaining years on COE (Singapore). Extract as a number. Null if not found.'),
    description: z.string().nullable().describe('The full dealer description or notes provided about the car.'),
    is_confident: z.boolean().describe('Set to true ONLY if you are highly confident that every extracted value is correct. Set to false if the text is ambiguous, fields appear missing, or you are unsure about any value.'),
});

export type ExtractedVehicleData = z.infer<typeof VehicleDataSchema>;

import { ParsedListing } from './parser';

function getModel() {
    const provider = process.env.AI_PROVIDER || 'google';
    switch (provider) {
        case 'google': {
            const google = createGoogleGenerativeAI({
                apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
            });
            return google('gemini-flash-lite-latest');
        }
        case 'openai': {
            const openai = createOpenAI({
                apiKey: process.env.OPENAI_API_KEY || '',
            });
            return openai('gpt-4o');
        }
        case 'deepseek': {
            const deepseek = createDeepSeek({
                apiKey: process.env.DEEPSEEK_API_KEY || '',
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                }
            });
            return deepseek('deepseek-chat');
        }
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
}

export async function parseListingWithLLM(rawText: string, url: string): Promise<ParsedListing | null> {
    try {
        const { output } = await generateText({
            model: getModel(),
            output: Output.object({
                schema: VehicleDataSchema,
            }),
            prompt: `You are an expert automotive data extraction agent.
      I will provide you with the raw text scraped from a used car listing in Singapore.
      Your job is to extract the following fields into valid JSON:
      - price: asking price in SGD (number or null). If "Sold", return null for price.
      - is_sold: boolean, true if the car is explicitly marked as "Sold" or price is "Sold".
      - mileage: mileage in km (number or null)
      - year: manufacturing year, typically shown after "Manufactured" or make and model (number or null)
      - registration_date: the "Reg Date" field in dd-MMM-yyyy format e.g. "15-Jan-2020" (string or null)
      - parf_rebate: PARF rebate amount if shown (number or null)
      - remaining_lease: remaining COE/lease years rounded to nearest integer eg. 9yrs 11mths 3days COE left (number or null)
      - description: the full dealer description or notes
      - is_confident: boolean, set to true if you are sure of the above.
      
      URL: ${url}
      
      Raw Text:
      ${rawText}
      `,
        });

        if (output && !output.is_confident) {
            console.warn(`[LLM] Model indicated low confidence for ${url} — discarding result.`);
            return null;
        }

        return output as ParsedListing;
    } catch (error) {
        console.error(`[LLM] Failed to parse listing for ${url}:`, error);
        return null;
    }
}
