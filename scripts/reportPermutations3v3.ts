import { generatePermutationReportFiles } from './reportPermutationsCommon';

generatePermutationReportFiles(3).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
