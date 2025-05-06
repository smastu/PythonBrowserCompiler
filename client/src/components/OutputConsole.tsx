import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import PlotModal from "./PlotModal";

interface OutputConsoleProps {
  output: string;
  onClear: () => void;
  onResize?: (height: number) => void;
}

export default function OutputConsole({ output, onClear, onResize }: OutputConsoleProps) {
  const [plotUrls, setPlotUrls] = useState<string[]>([]);
  const [isPlotModalOpen, setIsPlotModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    // Check for matplotlib output and extract plot URLs
    const checkForPlots = () => {
      // Skip if we're executing code
      if (output === "Executing code...") {
        return;
      }

      const urls: string[] = [];

      // Check plot container
      const plotContainer = document.querySelector(".plot-container");
      if (plotContainer instanceof HTMLElement) {
        const images = plotContainer.querySelectorAll("img");
        images.forEach(img => {
          if (img instanceof HTMLImageElement) {
            urls.push(img.src);
          }
        });
        plotContainer.style.display = "none";
      }

      // Check matplotlib output
      const matplotlibOutput = document.getElementById("matplotlib-output");
      if (matplotlibOutput instanceof HTMLElement) {
        const images = matplotlibOutput.querySelectorAll("img");
        images.forEach(img => {
          if (img instanceof HTMLImageElement) {
            urls.push(img.src);
          }
        });
        matplotlibOutput.style.display = "none";
      }

      // Check any matplotlib divs
      const matplotlibDivs = document.querySelectorAll('div[id^="matplotlib_"]');
      matplotlibDivs.forEach(div => {
        if (div instanceof HTMLElement) {
          const images = div.querySelectorAll("img");
          images.forEach(img => {
            if (img instanceof HTMLImageElement) {
              urls.push(img.src);
            }
          });
          div.style.display = "none";
        }
      });

      if (urls.length > 0) {
        setPlotUrls(urls);
      }
    };

    // Call immediately and set up a periodic check
    checkForPlots();
    const interval = setInterval(checkForPlots, 100);

    // Stop checking after 5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [output]);

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const newHeight = e.clientY - containerRect.top;
      
      if (newHeight >= 200) {
        container.style.height = `${newHeight}px`;
        onResize?.(newHeight);
      }
    };

    const handleResizeStart = (e: MouseEvent) => {
      e.preventDefault();
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeEnd = () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    const resizeHandle = resizeRef.current;
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', handleResizeStart);
    }

    return () => {
      if (resizeHandle) {
        resizeHandle.removeEventListener('mousedown', handleResizeStart);
      }
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [onResize]);

  const handleClear = () => {
    onClear();
    setPlotUrls([]);
    
    // Clear all plot containers
    const plotContainer = document.querySelector(".plot-container");
    if (plotContainer instanceof HTMLElement) {
      plotContainer.innerHTML = "";
      plotContainer.style.display = "none";
    }

    const matplotlibOutput = document.getElementById("matplotlib-output");
    if (matplotlibOutput instanceof HTMLElement) {
      matplotlibOutput.innerHTML = "";
      matplotlibOutput.style.display = "none";
    }

    // Clear any matplotlib divs
    const matplotlibDivs = document.querySelectorAll('div[id^="matplotlib_"]');
    matplotlibDivs.forEach(div => {
      if (div instanceof HTMLElement) {
        div.innerHTML = "";
        div.style.display = "none";
      }
    });
  };

  return (
    <div
      ref={containerRef}
      className="output-console bg-gray-800 rounded-md shadow-sm relative flex flex-col"
      style={{ height: '512px' }}
    >
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <h3 className="font-medium text-gray-200">Output</h3>
        <div className="flex items-center gap-2">
          {plotUrls.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlotModalOpen(true)}
              className="text-blue-400 hover:text-blue-300 border-blue-400 hover:border-blue-300"
            >
              View Plots ({plotUrls.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-300 border-gray-400 hover:border-gray-300"
          >
            Clear
          </Button>
        </div>
      </div>

      <div 
        ref={outputRef}
        className="p-4 overflow-auto flex-1"
        style={{ 
          fontFamily: "'Fira Code', monospace",
          minHeight: "100px"
        }}
      >
        {output ? (
          <pre className="whitespace-pre-wrap text-sm text-gray-200">{output}</pre>
        ) : (
          <p className="text-gray-400 italic">Run your code to see the output here...</p>
        )}
      </div>

      <div
        ref={resizeRef}
        className="absolute bottom-0 left-0 right-0 h-4 cursor-row-resize bg-gray-700 hover:bg-blue-500 transition-colors"
      >
        <div className="w-10 h-1 bg-gray-500 rounded-full mx-auto my-1.5"></div>
      </div>

      <PlotModal
        isOpen={isPlotModalOpen}
        onClose={() => setIsPlotModalOpen(false)}
        plotUrls={plotUrls}
      />
    </div>
  );
}