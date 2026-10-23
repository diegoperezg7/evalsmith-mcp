import { generateReport, type SuiteResult } from "../../core/index.js";

export const formatJson = (suite: SuiteResult): string => generateReport(suite, "json");
