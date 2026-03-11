import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';

const VehicleDataSchema = z.object({
    price: z.number().nullable().describe('The asking price in SGD. Remove commas and currency symbols. Null if "Sold" or not found.'),
    is_sold: z.boolean().describe('Set to true if the car is explicitly marked as "Sold" or price is "Sold". Set to false otherwise.'),
    mileage: z.number().nullable().describe('The mileage in km. Extract as a number. Null if not found.'),
    year: z.number().nullable().describe('The manufacturing year, typically found after "Manufactured" or make and model. Null if not found.'),
    registration_date: z.string().nullable().describe('The registration date labeled "Reg Date" in dd-MMM-yyyy format (e.g. 15-Jan-2020). Null if not found.'),
    parf_rebate: z.number().nullable().describe('The PARF rebate amount if specified. Null if not found.'),
    remaining_lease: z.number().nullable().describe('The remaining years on COE (Singapore). Extract as a number. Null if not found.'),
    description: z.string().nullable().describe('The full dealer description or notes provided about the car.'),
    is_confident: z.boolean().describe('Set to true if you are sure of price and registration date. Set to false otherwise.'),
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
      I will provide you with the raw text of a used car listing in Singapore.
      Your job is to extract the following fields into valid json.
      
      Example Raw Text Input:
      """
      Price
      $196,800
      Depreciation
      $18,890 /yr
      View Similar Depre
      Reg Date
      13-Oct-2025
      (9yrs 7mths 2days COE left)
      Mileage
      107,000 km (14.9k /yr)
      Manufactured
      2024
      Road Tax
      $1,204 /yr
      Transmission
      Auto
      Dereg Value
      $136,091 as of today
      Change
      Fuel Type
      Petrol-Electric
      COE
      $141,000
      OMV
      $29,682
      Engine Cap
      1,993 cc
      ARF
      $31,055 
      Curb Weight
      1,840 kg
      Power
      242.0 kW (324 bhp)
      Type of Vehicle
      MPV
      No. of Owners
      1
      Features
      We don't do gimmicks! We are premium preowned used car dealer with over hundreds of genuine 5 stars Facebook reviews with true efforts and hard work! View specs of the Honda Stepwgn Hybrid
      Accessories
      Blind spot indicator, adaptive cruise control, keyless entry/start/stop, multi function steering wheel, 16" aluminum sports rims, power tailgate.
      Description
      We'll do our best for you! New 7-seater Spada Hybrid! 100% ready stocks! Various financing options catered to your motoring needs from $0 drive away to 10 years loan! 5 years warranty and free oil service included and complimentary accessories worth up to to $5,000! Get your dream car now before it's too late and hurry head down to our showroom to enjoy our honest non-obligatory consultation!
      Category
      PARF Car, Almost New Car, Low Mileage Car, Hybrid Cars
      Posted on: 21-Feb-2026
      |
      Last Updated on: 22-Feb-2026
      """
      
      Example Output:
      {
        "price": 196800,
        "is_sold": false,
        "mileage": 107000,
        "year": 2024,
        "registration_date": "13-Oct-2025",
        "parf_rebate": null,
        "remaining_lease": 5,
        "description": "The full dealer description or notes",
        "is_confident": true
      }
      
      URL: ${url}
      
      Raw Text:
      ${rawText}
      `,
        });

        if (output && !output.is_confident) {
            console.warn(`[LLM] Model indicated low confidence for ${url} — discarding result.`);
            return null;
        }
        console.log(`[LLM] Model indicated high confidence for ${url} — returning result.`);
        return output as ParsedListing;
    } catch (error) {
        console.error(`[LLM] Failed to parse listing for ${url}:`, error);
        return null;
    }
}
