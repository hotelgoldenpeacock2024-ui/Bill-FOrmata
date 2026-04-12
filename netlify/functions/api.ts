import serverless from "serverless-http";
import { app } from "../../server";

export const handler = async (event: any, context: any) => {
  console.log("Netlify Function Request:", event.path);
  const result = await serverless(app)(event, context);
  return result;
};
