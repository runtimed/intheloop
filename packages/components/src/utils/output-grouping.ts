import type { OutputData } from "@runtimed/schema";

/**
 * Groups consecutive terminal outputs of the same type (stdout/stderr) into single outputs
 * and consecutive markdown outputs into single outputs.
 * This improves readability by avoiding fragmented output.
 * @param outputs - Array of output data objects sorted by position
 * @returns Array with consecutive outputs of the same type merged into single outputs
 */
function isTerminalOutput(output: OutputData): boolean {
  return output.outputType === "terminal" && typeof output.data === "string";
}

function isMarkdownOutput(output: OutputData): boolean {
  return output.outputType === "markdown" && typeof output.data === "string";
}

export function groupConsecutiveStreamOutputs(
  outputs: readonly OutputData[]
): OutputData[] {
  const result: OutputData[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const currentOutput = outputs[i];

    // Handle terminal outputs
    if (isTerminalOutput(currentOutput)) {
      // Start collecting consecutive terminal outputs of the same stream type
      const currentStreamName = currentOutput.streamName;
      const textParts = [currentOutput.data as string];

      // Look ahead for more consecutive terminal outputs of the same type
      let j = i + 1;
      while (j < outputs.length) {
        const nextOutput = outputs[j];

        if (!isTerminalOutput(nextOutput)) {
          break;
        }

        // Only group outputs of the same stream type (stdout/stderr)
        if (nextOutput.streamName !== currentStreamName) {
          break;
        }

        textParts.push(nextOutput.data as string);
        j++;
      }

      // Create the merged output with concatenated text
      const mergedOutput: OutputData = {
        ...currentOutput,
        data: textParts.join(""),
      };

      result.push(mergedOutput);
      i = j - 1; // Skip all the outputs we just merged (will be incremented by for loop)
      continue;
    }

    // Handle markdown outputs
    if (isMarkdownOutput(currentOutput)) {
      // Start collecting consecutive markdown outputs
      const textParts = [currentOutput.data as string];

      // Look ahead for more consecutive markdown outputs
      let j = i + 1;
      while (j < outputs.length) {
        const nextOutput = outputs[j];

        if (!isMarkdownOutput(nextOutput)) {
          break;
        }

        textParts.push(nextOutput.data as string);
        j++;
      }

      // Create the merged output with concatenated text
      const mergedOutput: OutputData = {
        ...currentOutput,
        data: textParts.join(""),
      };

      result.push(mergedOutput);
      i = j - 1; // Skip all the outputs we just merged (will be incremented by for loop)
      continue;
    }

    // If it's not a terminal or markdown output, just add it as-is
    result.push(currentOutput);
  }

  return result;
}
