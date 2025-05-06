import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SystemInfoProps {
  interpreter: "pyodide" | "micropython";
  version: string;
}

export default function SystemInfo({ interpreter, version }: SystemInfoProps) {
  const [showModuleInfo, setShowModuleInfo] = useState(false);
  
  const availableModules = [
    { name: "numpy", description: "Numerical computing" },
    { name: "pandas", description: "Data analysis and manipulation" },
    { name: "matplotlib", description: "Plotting library" },
    { name: "scikit-learn", description: "Machine learning" },
    { name: "random", description: "Random number generation" },
    { name: "math", description: "Mathematical functions" },
    { name: "time", description: "Time access and conversions" }
  ];
  
  return (
    <div className="bg-white rounded-md shadow-sm border border-gray-300 p-4" style={{ position: 'relative', zIndex: 5, display: 'block', visibility: 'visible' }}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-gray-700">System Information</h3>
        <button 
          className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-1 px-3 rounded"
          onClick={() => setShowModuleInfo(!showModuleInfo)}
          style={{ minWidth: '100px', display: 'block' }}
        >
          {showModuleInfo ? "Hide Modules" : "Show Modules"}
        </button>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Framework:</span>
          <span className="font-medium text-primary">PyScript</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Version:</span>
          <span className="font-medium">2025.3.1</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Mode:</span>
          <span className="font-medium">Browser Execution</span>
        </div>
        
        {showModuleInfo && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h4 className="font-medium text-gray-700 mb-2">Available Modules</h4>
            <div className="flex flex-wrap gap-2">
              {availableModules.map(module => (
                <Badge 
                  key={module.name} 
                  variant="outline" 
                  className="bg-gray-50 text-gray-700 hover:bg-gray-100 cursor-default"
                  title={module.description}
                >
                  {module.name}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Hover on a module to see its description</p>
            <div className="text-xs text-gray-600 mt-3 italic">
              Import example: <code>import pandas as pd</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
