import { Button } from "@/components/ui/button";

interface DownloadOptionsProps {
  code: string;
  output: string;
}

export default function DownloadOptions({ code, output }: DownloadOptionsProps) {
  const downloadCode = () => {
    if (!code.trim()) {
      alert("There is no code to download.");
      return;
    }

    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "python_code.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOutput = () => {
    if (!output || output === "Executing code..." || output === "No code to execute. Please write some code.") {
      alert("There is no output to download. Run your code first.");
      return;
    }

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "python_output.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-md shadow-sm border border-gray-300 p-4" style={{ position: 'relative', zIndex: 5 }}>
      <h3 className="font-medium text-gray-700 mb-3">Download Options</h3>
      <div className="space-y-3">
        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded flex items-center justify-center"
          onClick={downloadCode}
          style={{ display: 'block', visibility: 'visible', marginBottom: '0.5rem' }}
        >
          <i className="ri-file-code-line mr-2"></i> Download Python Code
        </button>
        <button
          className="w-full bg-gray-700 hover:bg-gray-800 text-white p-2 rounded flex items-center justify-center"
          onClick={downloadOutput}
          style={{ display: 'block', visibility: 'visible' }}
        >
          <i className="ri-file-text-line mr-2"></i> Download Output
        </button>
      </div>
    </div>
  );
}
