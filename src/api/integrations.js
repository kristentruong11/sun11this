import { invokeLLM } from "@/lib/custom-sdk";

export const InvokeLLM = invokeLLM;

export const integrations = {
  Core: {
    InvokeLLM: (args) => invokeLLM(args),
  },
};
