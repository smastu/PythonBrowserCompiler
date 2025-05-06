import { Button } from "@/components/ui/button";
import { codeExamples } from "@/lib/codeExamples";

interface ExampleSnippetsProps {
  setCode: (code: string) => void;
}

export default function ExampleSnippets({ setCode }: ExampleSnippetsProps) {
  return (
    <div className="bg-white rounded-md shadow-sm p-4 border border-gray-300">
      <h3 className="font-medium text-gray-700 mb-2">Example Snippets</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(codeExamples).map(([name, code]) => (
          <Button
            key={name}
            variant="outline"
            className="bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded text-left text-sm text-gray-700 truncate border border-gray-200 h-auto justify-start"
            onClick={() => setCode(code)}
          >
            <i className="ri-code-line mr-1 text-primary"></i> {name}
          </Button>
        ))}
      </div>
    </div>
  );
}
