import { Button } from "@/components/ui/button";

interface ExecuteButtonProps {
  onRunCode: () => void;
  loading: boolean;
}

export default function ExecuteButton({ 
  onRunCode,
  loading 
}: ExecuteButtonProps) {
  return (
    <div className="flex items-center justify-start mb-2">
      <Button
        type="button"
        variant="default"
        className={`
          text-white font-medium px-5 py-2 transition-all duration-300 ease-in-out
          ${loading ? 'bg-blue-500 hover:bg-blue-500' : 'bg-green-600 hover:bg-blue-600'}
        `}
        style={{
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
          minWidth: '110px', // Fixed width to prevent layout shift
        }}
        onClick={onRunCode}
        disabled={loading}
      >
        {loading ? (
          <>
            <svg 
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              ></circle>
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Running</span>
          </>
        ) : (
          <>
            <i className="ri-play-fill mr-1"></i> 
            <span>Run Code</span>
          </>
        )}
      </Button>
    </div>
  );
}
