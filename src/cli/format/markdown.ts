import { generateReport, type SuiteResult } from "../../core/index.js";

export const formatMarkdown = (suite: SuiteResult): string => generateReport(suite, "markdown");
