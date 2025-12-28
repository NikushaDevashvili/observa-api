import { createServer } from "@vercel/node";
import app from "../src/index.js";

export default createServer(app);
