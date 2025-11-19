// Fix: Add global declarations for window.XLSX and window.saveAs
// to inform TypeScript that these variables are available on the global window object.
// They are likely loaded from <script> tags in the main HTML file.
declare global {
  interface Window {
    XLSX: any;
    saveAs: any;
  }
}

import React, { useState, useCallback, useRef } from 'react';
import { Dropzone } from './components/Dropzone';
import { LogConsole } from './components/LogConsole';
import { Button } from './components/Button';
import { Tutorial } from './components/Tutorial';
import { DownloadIcon, RocketIcon, RicLogoIcon, RefreshIcon } from './components/icons';
import { transformData } from './services/transformer';
import type { ValidationResult, OutputData } from './services/transformer';
import type { FileStatus, FileType, LogEntry } from './types';

const App = () => {
    const [files, setFiles] = useState<{ [key in FileType]: File | null }>({
        input: null,
        results: null,
    });
    const [fileStatus, setFileStatus] = useState<{ [key in FileType]: FileStatus }>({
        input: 'waiting',
        results: 'waiting',
    });
    const [fileErrors, setFileErrors] = useState<{ [key in FileType]: string | null }>({
        input: null,
        results: null,
    });
    
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [outputData, setOutputData] = useState<OutputData | null>(null);
    
    // Used to force remounting of Dropzones to clear internal file inputs completely
    const [resetKey, setResetKey] = useState<number>(0);

    const fileDataCache = useRef<{ [key in FileType]: any | null }>({
        input: null,
        results: null,
    });

    const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
        setLogs(prev => [...prev, { message, type, timestamp: new Date().toISOString() }]);
    }, []);

    const handleFileChange = useCallback(async (file: File, type: FileType) => {
        setFiles(prev => ({ ...prev, [type]: file }));
        setOutputData(null); // Reset output on new file
        setFileStatus(prev => ({...prev, [type]: 'loading' }));
        setFileErrors(prev => ({...prev, [type]: null }));

        try {
            const { jsonData, validation } = await transformData(type, file, addLog);
            if (validation.isValid) {
                fileDataCache.current[type] = jsonData;
                setFileStatus(prev => ({...prev, [type]: 'valid' }));
                addLog(`'${file.name}' loaded and validated successfully.`, 'success');
            } else {
                fileDataCache.current[type] = null;
                setFileStatus(prev => ({...prev, [type]: 'invalid' }));
                const firstError = validation.errors[0];
                setFileErrors(prev => ({...prev, [type]: firstError }));
                validation.errors.forEach(err => addLog(err, 'error'));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Error processing ${file.name}: ${errorMessage}`, 'error');
            setFileStatus(prev => ({...prev, [type]: 'invalid' }));
            setFileErrors(prev => ({...prev, [type]: errorMessage }));
            fileDataCache.current[type] = null;
        }
    }, [addLog]);

    const handleRunTransformation = useCallback(async () => {
        if (!fileDataCache.current.input || !fileDataCache.current.results) {
            addLog("Both Input and Results files must be loaded and valid before running.", 'error');
            return;
        }

        setIsProcessing(true);
        setOutputData(null);
        setLogs([]); // Clear logs for new run
        addLog("Starting transformation process...");

        // Slight delay to allow UI to update processing state before heavy synchronous work
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const { output } = await transformData('process', null, addLog, fileDataCache.current.input, fileDataCache.current.results);
            if (output) {
                setOutputData(output);
                addLog("Transformation complete. Output files are ready for download.", 'success');
            } else {
                throw new Error("Transformation did not produce any output data.");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`An unexpected error occurred during transformation: ${errorMessage}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    }, [addLog]);

    const handleDownload = (key: keyof OutputData, fileName: string) => {
        if (!outputData || !outputData[key] || outputData[key].length === 0) {
            addLog(`No data available to download for ${fileName}.`, 'error');
            return;
        }
        addLog(`Generating ${fileName}...`);
        try {
            const ws = window.XLSX.utils.json_to_sheet(outputData[key]);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const excelBuffer = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
            window.saveAs(blob, fileName);
            addLog(`${fileName} downloaded successfully.`, 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Failed to generate ${fileName}: ${errorMessage}`, 'error');
        }
    };

    const handleReset = () => {
        // Clears all state immediately without blocking confirmation dialogs
        setFiles({ input: null, results: null });
        setFileStatus({ input: 'waiting', results: 'waiting' });
        setFileErrors({ input: null, results: null });
        setLogs([]);
        setOutputData(null);
        fileDataCache.current = { input: null, results: null };
        // Increment key to force re-render of Dropzones (clears internal file inputs)
        setResetKey(prev => prev + 1);
    };

    const canRun = fileStatus.input === 'valid' && fileStatus.results === 'valid';

    return (
        <div className="min-h-screen bg-slate-800/50 flex flex-col items-center p-4 sm:p-6 md:p-8">
            <div className="w-full max-w-6xl mx-auto relative">
                
                {/* Reset Button */}
                {(fileStatus.input !== 'waiting' || fileStatus.results !== 'waiting') && (
                    <button 
                        onClick={handleReset}
                        className="absolute top-0 right-0 z-50 mt-2 mr-2 sm:mt-0 sm:mr-0 flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-500 transition-all bg-slate-800 py-2 px-4 rounded-lg border border-slate-600 shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                        title="Reset all files and logs"
                    >
                        <RefreshIcon className="w-4 h-4" />
                        Start Over
                    </button>
                )}

                <header className="text-center mb-8 border-b border-slate-700 pb-6 pt-4">
                     <div className="flex items-center justify-center gap-4 text-green-400">
                        <RicLogoIcon className="w-14 h-14 sm:w-16 sm:h-16" />
                        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
                           RIC Energy Italia
                        </h1>
                    </div>
                     <p className="text-lg font-medium text-slate-300 mt-3">Scouting & Technical Team Land Tool</p>
                    <p className="text-slate-400 mt-2 max-w-2xl mx-auto text-sm leading-relaxed">
                        Securely process land acquisition Excel files locally in your browser.
                    </p>
                </header>

                <Tutorial />

                <main className="space-y-8">
                    <div className="bg-slate-900/70 p-6 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                        <h2 className="text-2xl font-semibold mb-6 text-slate-100 flex items-center gap-2">
                            <span className="bg-green-500/20 text-green-400 text-sm font-bold px-2 py-1 rounded uppercase tracking-wider">Step 1</span>
                            Upload Source Data
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Dropzone
                                key={`input-${resetKey}`}
                                title="Input File"
                                description="e.g. Corrected_Input_Piemonte.xlsx"
                                onFileSelect={(file) => handleFileChange(file, 'input')}
                                status={fileStatus.input}
                                fileName={files.input?.name}
                                errorMessage={fileErrors.input}
                            />
                            <Dropzone
                                key={`results-${resetKey}`}
                                title="Results File"
                                description="e.g. Campaign_Results.xlsx"
                                onFileSelect={(file) => handleFileChange(file, 'results')}
                                status={fileStatus.results}
                                fileName={files.results?.name}
                                errorMessage={fileErrors.results}
                            />
                        </div>
                    </div>
                    
                    <div className={`bg-slate-900/70 p-6 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden transition-all duration-500 ${canRun ? 'opacity-100' : 'opacity-50 grayscale pointer-events-none'}`}>
                         <div className="absolute top-0 left-0 w-1 h-full bg-slate-600"></div>
                        <h2 className="text-2xl font-semibold mb-6 text-slate-100 flex items-center gap-2">
                             <span className="bg-slate-600/20 text-slate-400 text-sm font-bold px-2 py-1 rounded uppercase tracking-wider">Step 2</span>
                            Processing
                        </h2>
                        <div className="flex flex-col items-center">
                            <Button
                                onClick={handleRunTransformation}
                                disabled={!canRun || isProcessing}
                                className="w-full max-w-sm text-lg py-4 transform hover:scale-105 transition-transform"
                            >
                                <RocketIcon className="w-6 h-6" />
                                {isProcessing ? 'Processing...' : 'Run Transformation'}
                            </Button>
                            <LogConsole logs={logs} />
                        </div>
                    </div>

                    {outputData && (
                        <div className="bg-slate-900/70 p-6 rounded-2xl shadow-lg border border-slate-700 animate-fade-in relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                            <h2 className="text-2xl font-semibold mb-6 text-slate-100 flex items-center gap-2">
                                <span className="bg-green-500/20 text-green-400 text-sm font-bold px-2 py-1 rounded uppercase tracking-wider">Step 3</span>
                                Review & Download
                            </h2>
                            
                            {/* Results Summary Dashboard */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50 text-center">
                                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-1">Scouted Lands</p>
                                    <p className="text-3xl font-bold text-white">{outputData.scouted.length}</p>
                                    <p className="text-xs text-slate-500 mt-1">Records Generated</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50 text-center">
                                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-1">Retrieved Data</p>
                                    <p className="text-3xl font-bold text-white">{outputData.retrieved.length}</p>
                                    <p className="text-xs text-slate-500 mt-1">Records Generated</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50 text-center">
                                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-1">Contacted Data</p>
                                    <p className="text-3xl font-bold text-white">{outputData.contacted.length}</p>
                                    <p className="text-xs text-slate-500 mt-1">Records Generated</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                               <Button variant="secondary" onClick={() => handleDownload('scouted', '1_Scouted_Lands.xlsx')}>
                                    <DownloadIcon /> Download Carga 1
                                </Button>
                                <Button variant="secondary" onClick={() => handleDownload('retrieved', '2_Retrieved_Data.xlsx')}>
                                    <DownloadIcon /> Download Carga 2
                                </Button>
                                <Button variant="secondary" onClick={() => handleDownload('contacted', '3_Contacted_Data.xlsx')}>
                                    <DownloadIcon /> Download Carga 3
                                </Button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;