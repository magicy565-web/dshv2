/** CSS imports are bundled into the standalone preview by esbuild. */
declare module '*.css' {
  const stylesheet: string
  export default stylesheet
}
