export function configTemplate(outputDir: string): string {
  return `export default {
  outputDir: "${outputDir}",
  components: [],
};
`;
}
