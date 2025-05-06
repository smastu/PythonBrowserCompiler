/**
 * Helper functions to interact with PyScript 2025.3.1 in the browser
 */

// Wait for PyScript to be ready
const waitForPyScriptReady = (): Promise<void> => {
  return new Promise((resolve) => {
    // Check if PyScript functions are already available
    if ((window as any).pyExecuteCode && (window as any).pyGetVersion) {
      resolve();
      return;
    }
    
    // Retry a few times with increasing delay
    let attempts = 0;
    const checkPyScript = () => {
      if ((window as any).pyExecuteCode && (window as any).pyGetVersion) {
        resolve();
        return;
      }
      
      attempts++;
      if (attempts < 10) {
        setTimeout(checkPyScript, 500 * attempts);
      } else {
        // Failed to load after multiple attempts
        resolve(); // Resolve anyway, the functions will handle errors
      }
    };
    
    // Start checking
    setTimeout(checkPyScript, 500);
  });
};

/**
 * Execute Python code using PyScript 2025.3.1
 */
export const executeCode = async (
  code: string, 
  interpreter: "pyodide" | "micropython", 
  customModules: string[] = []
): Promise<string> => {
  await waitForPyScriptReady();
  
  try {
    console.log("Executing Python code...");
    
    // Check if PyScript interface is available
    if (!(window as any).pyExecuteCode) {
      return "Error: PyScript is not fully initialized. Please refresh the page and try again.";
    }
    
    // Ensure no unterminated strings in the code (common error with copy/paste)
    // This is a simple check and won't catch all issues, but helps with basic errors
    const sanitizedCode = code.split('\n').map(line => {
      // Check for odd number of quotes which might indicate unterminated string
      const singleQuotes = (line.match(/'/g) || []).length;
      const doubleQuotes = (line.match(/"/g) || []).length;
      
      // If line has odd number of quotes and doesn't end with a continuation character
      if ((singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) && !line.trim().endsWith('\\')){  
        console.warn('Possibly unterminated string in line:', line);
        // Don't auto-fix as it could change code meaning
      }
      return line;
    }).join('\n');
    
    // Prepare custom module import headers if needed
    let codeWithImports = sanitizedCode;
    
    // Add custom module imports if specified
    if (customModules && customModules.length > 0) {
      const moduleImports = customModules.map(module => {
        // For modules with standard alias conventions (like 'pandas as pd')
        if (module === 'pandas') return `import pandas as pd`;
        if (module === 'matplotlib') return `import matplotlib.pyplot as plt`;
        if (module === 'numpy') return `import numpy as np`; 
        if (module === 'scipy') return `import scipy as sp`;
        // Default import format
        return `import ${module}`;
      }).join('\n');
      
      // Add imports at beginning of code with an explanatory comment
      codeWithImports = `# Auto-imported modules requested by user\n${moduleImports}\n\n# User code\n${sanitizedCode}`;
    }
    
    // Pass code with custom imports to PyScript
    console.log(`Executing with ${customModules.length} custom modules`);
    const output = await (window as any).pyExecuteCode(codeWithImports);
    return output || "Code executed successfully (no output)";
  } catch (error) {
    console.error("Error executing code:", error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * Get the interpreter version using PyScript 2025.3.1
 */
export const getInterpreterVersion = async (interpreter: "pyodide" | "micropython"): Promise<string> => {
  await waitForPyScriptReady();
  
  try {
    // Check if PyScript interface is available
    if (!(window as any).pyGetVersion) {
      return "PyScript is initializing...";
    }
    
    // Use the exposed Python function
    const version = await (window as any).pyGetVersion();
    return version || "Python (version unknown)";
  } catch (error) {
    console.error("Error getting version:", error);
    return `Python (version unknown)`;
  }
};
