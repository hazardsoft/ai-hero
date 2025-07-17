import { createPerplexity } from "@ai-sdk/perplexity";

const perplexity = createPerplexity({
  apiKey: process.env.PERPLEXITY_API_KEY ?? "",
});
