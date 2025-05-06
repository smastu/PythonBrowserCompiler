import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface PlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  plotUrls: string[];
}

export default function PlotModal({ isOpen, onClose, plotUrls }: PlotModalProps) {
  const [currentPlotIndex, setCurrentPlotIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
      setCurrentPlotIndex(0);
    }
  }, [isOpen]);

  const handlePrevious = () => {
    setCurrentPlotIndex((prev) => (prev > 0 ? prev - 1 : plotUrls.length - 1));
  };

  const handleNext = () => {
    setCurrentPlotIndex((prev) => (prev < plotUrls.length - 1 ? prev + 1 : 0));
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`p-0 bg-transparent border-none shadow-none [&>button]:hidden ${isFullscreen ? 'w-screen h-screen max-w-none' : 'max-w-4xl'}`}>
        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
          {plotUrls.length > 0 && (
            <div className="relative">
              <img
                src={plotUrls[currentPlotIndex]}
                alt={`Plot ${currentPlotIndex + 1}`}
                className="w-full h-auto"
                style={{ maxHeight: isFullscreen ? 'calc(100vh - 80px)' : '70vh' }}
              />
              
              {/* Navigation buttons */}
              {plotUrls.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-gray-800/80 hover:bg-gray-700/80 text-white"
                  >
                    ←
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-800/80 hover:bg-gray-700/80 text-white"
                  >
                    →
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Control buttons */}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="bg-gray-800/80 hover:bg-gray-700/80 text-white"
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="bg-gray-800/80 hover:bg-gray-700/80 text-white"
            >
              Close
            </Button>
          </div>

          {/* Plot counter */}
          {plotUrls.length > 1 && (
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-gray-800/80 text-white px-3 py-1 rounded-full text-sm">
              {currentPlotIndex + 1} / {plotUrls.length}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 