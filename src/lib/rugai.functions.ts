import { createServerFn } from "@tanstack/react-start";

export const scanMintFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const mint = typeof input === "object" && input && "mint" in input ? String(input.mint) : "";
    return { mint };
  })
  .handler(async ({ data }) => {
    const { scanMint } = await import("./rugai.server");
    return scanMint(data.mint);
  });
