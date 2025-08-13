import React, { useState, useRef } from "react";

// Main application component
const App = () => {
  // --- Application UI & Data State ---
  const [activeTab, setActiveTab] = useState("extract");
  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [extractedDataSummary, setExtractedDataSummary] = useState("");
  const [referenceDocs, setReferenceDocs] = useState([]);
  const [selectedRefDoc, setSelectedRefDoc] = useState(null);
  const [generatedOutput, setGeneratedOutput] = useState("");
  const [outputType, setOutputType] = useState(null); // 'CTD' or 'Discrepancy'
  const [critiqueReport, setCritiqueReport] = useState("");
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [selectedSavedDoc, setSelectedSavedDoc] = useState(null);

  // --- Loading & UI State ---
  const [isLoading, setIsLoading] = useState(false); // For data extraction
  const [isOutputLoading, setIsOutputLoading] = useState(false); // For CTD generation
  const [isReferenceLoading, setIsReferenceLoading] = useState(false); // For adding reference docs
  const [isPopulating, setIsPopulating] = useState(false); // For smart populate feature
  const [isSavingOutput, setIsSavingOutput] = useState(false); // For saving reports
  const [isPlaying, setIsPlaying] = useState(false); // For TTS
  const [isSummarizing, setIsSummarizing] = useState(false); // For data summary
  const [isCritiquing, setIsCritiquing] = useState(false); // For report critique
  const [newRefDoc, setNewRefDoc] = useState({
    title: "",
    number: "",
    summary: "",
    tests: "",
  });
  const [message, setMessage] = useState("");

  // --- TTS Refs ---
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);

  // --- File Input Refs ---
  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);

  // --- Utility Functions ---

  // Function to show a temporary message to the user
  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 5000);
  };

  // Helper function for exponential backoff on API calls
  const withExponentialBackoff = async (fn, retries = 5, delay = 1000) => {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        console.warn(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        return withExponentialBackoff(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  };

  // --- Core Application Logic ---

  // File handling function
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setRawText(e.target.result);
      };
      reader.readAsText(file);
    }
  };

  // File handling function for reference documents
  const handleRefFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewRefDoc({ ...newRefDoc, summary: e.target.result });
      };
      reader.readAsText(file);
    }
  };

  // 1. Data Extraction using Gemini API
  const extractData = async () => {
    if (!rawText.trim()) {
      showMessage("Please enter some text to parse.");
      return;
    }
    setIsLoading(true);
    setExtractedData(null);
    setExtractedDataSummary("");
    setGeneratedOutput("");

    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    // Define the JSON schema for the desired output
    const jsonSchema = {
      type: "OBJECT",
      properties: {
        document_title: { type: "STRING" },
        document_number: { type: "STRING" },
        revision_date: { type: "STRING" },
        summary: { type: "STRING" },
        tests: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              test_name: { type: "STRING" },
              result: { type: "STRING" },
            },
          },
        },
      },
      propertyOrdering: [
        "document_title",
        "document_number",
        "revision_date",
        "summary",
        "tests",
      ],
    };

    const prompt = `You are a helpful assistant for extracting data from technical documents. Extract the following information from the provided text into a structured JSON object, following the given schema. Be concise and only include information explicitly found in the text. If a field is not present, use null.
        \n\nText to parse:\n${rawText}`;

    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        },
      };
      const result = await withExponentialBackoff(async () => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`API call failed with status: ${response.status}`);
        return response.json();
      });
      const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (jsonString) {
        const parsedJson = JSON.parse(jsonString);
        setExtractedData(parsedJson);
        showMessage("Data extracted successfully!");
      } else {
        showMessage("Could not extract data. Please try again.");
      }
    } catch (error) {
      console.error("Error during data extraction:", error);
      showMessage("Failed to extract data. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // 1a. Summarize extracted data using Gemini API
  const summarizeData = async () => {
    if (!extractedData) {
      showMessage("Please extract data first.");
      return;
    }
    setIsSummarizing(true);
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `You are an AI assistant for technical document review. Take the following structured data and generate a clear and concise summary in a single paragraph. Focus on the key findings, test results, and overall document purpose.
        \n\nData to summarize:\n${JSON.stringify(extractedData, null, 2)}`;
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };
      const result = await withExponentialBackoff(async () => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`API call failed with status: ${response.status}`);
        return response.json();
      });
      const summary = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) {
        setExtractedDataSummary(summary);
        showMessage("Summary generated successfully!");
      } else {
        showMessage("Could not generate summary.");
      }
    } catch (error) {
      console.error("Error summarizing data:", error);
      showMessage("Failed to summarize data. See console for details.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // 2. Smart Populate for Reference Documents using Gemini API
  const populateReferenceFromText = async () => {
    if (!newRefDoc.summary) {
      showMessage("Please paste text into the summary field to populate.");
      return;
    }
    setIsPopulating(true);
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const jsonSchema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        number: { type: "STRING" },
        summary: { type: "STRING" },
        tests: { type: "STRING" },
      },
      propertyOrdering: ["title", "number", "summary", "tests"],
    };
    const prompt = `Extract the following information from the text provided into a JSON object with the fields 'title', 'number', 'summary', and 'tests' (as a comma-separated string). If a field is not found, leave it as null.
        \n\nText to parse:\n${newRefDoc.summary}`;
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        },
      };
      const result = await withExponentialBackoff(async () => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`API call failed with status: ${response.status}`);
        return response.json();
      });
      const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (jsonString) {
        const parsedJson = JSON.parse(jsonString);
        setNewRefDoc({
          title: parsedJson.title || "",
          number: parsedJson.number || "",
          summary: parsedJson.summary || "",
          tests: parsedJson.tests || "",
        });
        showMessage("Reference document populated successfully!");
      } else {
        showMessage("Could not populate reference. Please try again.");
      }
    } catch (error) {
      console.error("Error populating reference:", error);
      showMessage("Failed to populate reference. See console for details.");
    } finally {
      setIsPopulating(false);
    }
  };

  // 3. Add Reference Document to Local State
  const addReferenceDocument = async (e) => {
    e.preventDefault();
    if (!newRefDoc.title || !newRefDoc.summary) {
      showMessage("Title and Summary are required.");
      return;
    }
    setIsReferenceLoading(true);
    try {
      const newDoc = {
        id: Date.now().toString(), // Simple ID generation
        ...newRefDoc,
        tests: newRefDoc.tests.split(",").map((s) => s.trim()),
        createdAt: new Date(),
      };
      setReferenceDocs([...referenceDocs, newDoc]);
      showMessage("Reference document added successfully!");
      setNewRefDoc({ title: "", number: "", summary: "", tests: "" });
    } catch (error) {
      console.error("Error adding document:", error);
      showMessage("Error adding document. See console for details.");
    } finally {
      setIsReferenceLoading(false);
    }
  };

  // 4. Generate CTD or Discrepancy Report using Gemini API
  const compareAndGenerateOutput = async () => {
    if (!extractedData || !selectedRefDoc) {
      showMessage("Please extract data and select a reference document first.");
      return;
    }
    setIsOutputLoading(true);
    setGeneratedOutput("");
    setCritiqueReport("");
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    // Simple comparison of test names
    const extractedTestNames = extractedData.tests.map((t) =>
      t.test_name.toLowerCase()
    );
    const referenceTestNames = selectedRefDoc.tests.map((t) => t.toLowerCase());
    const hasDiscrepancy =
      extractedTestNames.some((t) => !referenceTestNames.includes(t)) ||
      referenceTestNames.some((t) => !extractedTestNames.includes(t));

    let prompt;
    if (hasDiscrepancy) {
      setOutputType("Discrepancy");
      prompt = `You are a regulatory expert. Generate a detailed discrepancy report based on a comparison of an extracted document and a reference document. Use semantic similarity, not just literal text matching, to identify issues.
            Specifically, highlight:
            - Any tests from the extracted document that are semantically different from the reference.
            - Any tests required by the reference that are missing from the extracted document.
            - A concise summary of the key discrepancies.

            Extracted Data:
            ${JSON.stringify(extractedData, null, 2)}

            Reference Data:
            ${JSON.stringify(selectedRefDoc, null, 2)}
            `;
    } else {
      setOutputType("CTD");
      prompt = `You are an expert in regulatory documentation. Generate a final CTD summary based on an extracted document and a reference document. The documents have been semantically validated and found to be consistent.
            
            Format the output with a clear title and number. The summary should be a paragraph or two that combines information from both documents, highlighting key findings and confirming full compliance with the reference document's test requirements.

            Extracted Data:
            ${JSON.stringify(extractedData, null, 2)}

            Reference Data:
            ${JSON.stringify(selectedRefDoc, null, 2)}
            `;
    }
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };
      const result = await withExponentialBackoff(async () => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`API call failed with status: ${response.status}`);
        return response.json();
      });
      const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textContent) {
        setGeneratedOutput(textContent);
        showMessage(`${outputType} generated successfully!`);
      } else {
        showMessage(`Could not generate ${outputType}. Please try again.`);
      }
    } catch (error) {
      console.error(`Error generating ${outputType}:`, error);
      showMessage(`Failed to generate ${outputType}. See console for details.`);
    } finally {
      setIsOutputLoading(false);
    }
  };

  // 4a. Critique generated output using Gemini API
  const critiqueOutput = async () => {
    if (!generatedOutput) {
      showMessage("Please generate a report first.");
      return;
    }
    setIsCritiquing(true);
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `You are a helpful peer reviewer. Read the following document and provide constructive feedback and suggestions for improvement. Focus on clarity, tone, completeness, and formatting. The output should be a professional, actionable critique.
        \n\nDocument to critique:\n${generatedOutput}`;
    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };
      const result = await withExponentialBackoff(async () => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`API call failed with status: ${response.status}`);
        return response.json();
      });
      const critique = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (critique) {
        setCritiqueReport(critique);
        showMessage("Critique generated successfully!");
      } else {
        showMessage("Could not generate critique.");
      }
    } catch (error) {
      console.error("Error critiquing output:", error);
      showMessage("Failed to generate critique. See console for details.");
    } finally {
      setIsCritiquing(false);
    }
  };

  // 5. Save Final Document to Local State
  const saveFinalDocument = async () => {
    if (!generatedOutput) {
      showMessage("No document to save.");
      return;
    }
    setIsSavingOutput(true);
    try {
      const newDoc = {
        id: Date.now().toString(), // Simple ID generation
        extractedData,
        referenceDoc: selectedRefDoc,
        generatedOutput,
        outputType,
        createdAt: new Date(),
      };
      setSavedDocuments([...savedDocuments, newDoc]);
      showMessage("Document saved successfully!");
      // Reset the CTD generator tab after saving
      setGeneratedOutput("");
      setExtractedData(null);
      setSelectedRefDoc(null);
      setActiveTab("archive"); // Switch to the archive tab to show the new document
    } catch (error) {
      console.error("Error saving document:", error);
      showMessage("Error saving document. See console for details.");
    } finally {
      setIsSavingOutput(false);
    }
  };

  // 6. Text-to-Speech using Gemini TTS API
  const speakOutput = async () => {
    if (!generatedOutput) {
      showMessage("There is no text to read aloud.");
      return;
    }
    setIsPlaying(true);
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const prompt = `Say in a clear and professional voice: ${generatedOutput}`;
    try {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
        model: "gemini-2.5-flash-preview-tts",
      };
      const result = await withExponentialBackoff(async () => {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`TTS API call failed: ${res.status}`);
        return res.json();
      });
      const audioData =
        result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType =
        result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
      if (audioData && mimeType) {
        // Decode and play the PCM audio data
        const base64ToArrayBuffer = (base64) => {
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        };
        const pcmToWav = (pcm16, sampleRate) => {
          const dataView = new DataView(new ArrayBuffer(44 + pcm16.length * 2));
          let offset = 0;
          const writeString = (str) => {
            for (let i = 0; i < str.length; i++)
              dataView.setUint8(offset++, str.charCodeAt(i));
          };
          writeString("RIFF");
          dataView.setUint32(offset, 36 + pcm16.length * 2, true);
          offset += 4;
          writeString("WAVE");
          writeString("fmt ");
          dataView.setUint32(offset, 16, true);
          offset += 4;
          dataView.setUint16(offset, 1, true);
          offset += 2;
          dataView.setUint16(offset, 1, true);
          offset += 2;
          dataView.setUint32(offset, sampleRate, true);
          offset += 4;
          dataView.setUint32(offset, sampleRate * 2, true);
          offset += 4;
          dataView.setUint16(offset, 2, true);
          offset += 2;
          dataView.setUint16(offset, 16, true);
          offset += 2;
          writeString("data");
          dataView.setUint32(offset, pcm16.length * 2, true);
          offset += 4;
          for (let i = 0; i < pcm16.length; i++, offset += 2) {
            dataView.setInt16(offset, pcm16[i], true);
          }
          return new Blob([dataView.buffer], { type: "audio/wav" });
        };
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch
          ? parseInt(sampleRateMatch[1], 10)
          : 16000;
        const pcmData = base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData);
        const wavBlob = pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        audioContextRef.current.decodeAudioData(arrayBuffer, (buffer) => {
          if (sourceRef.current) {
            sourceRef.current.stop();
            sourceRef.current.disconnect();
          }
          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current.destination);
          source.start(0);
          sourceRef.current = source;
          source.onended = () => {
            setIsPlaying(false);
          };
        });
        showMessage("Reading aloud...");
      } else {
        showMessage("Could not get audio data from API.");
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Error with TTS API:", error);
      showMessage("Failed to generate speech. See console for details.");
      setIsPlaying(false);
    }
  };

  // --- UI Components ---
  const MessageBox = ({ message }) => {
    if (!message) return null;
    return (
      <div
        className={`fixed inset-x-0 bottom-4 w-3/4 max-w-md mx-auto px-6 py-4 rounded-xl shadow-lg text-center transition-all duration-300 ease-in-out z-50 border-l-4 mb-20 ${
          message.includes("Error") || message.includes("Failed")
            ? "bg-red-50 border-red-500 text-red-800"
            : message.includes("Success") || message.includes("completed")
            ? "bg-green-50 border-green-500 text-green-800"
            : "bg-blue-50 border-blue-500 text-blue-800"
        }`}
      >
        <div className='flex items-center justify-center gap-2 mb-20'>
          <span style={{ fontSize: "1.2rem" }}>
            {message.includes("Error") || message.includes("Failed")
              ? "❌"
              : message.includes("Success") || message.includes("completed")
              ? "✅"
              : "ℹ️"}
          </span>
          <span className='font-medium'>{message}</span>
        </div>
      </div>
    );
  };

  const LoadingSpinner = () => (
    <div className='loading-spinner w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin ml-2'></div>
  );

  return (
    <div className='main-container'>
      <div className='bg-white rounded-3xl border border-gray-300 shadow-lg'>
        {/* Header with logos */}
        <div className='header-section'>
          <div className='logo-container'>
            <div className='logo'>🧬</div>
            <div className='logo'>🔬</div>
            <div className='logo'>📊</div>
          </div>
          <h1 className='text-4xl font-bold text-center mb-2'>
            AI Dossier & CTD Tool
          </h1>
          <p className='text-center text-gray-500 mb-8'>
            Streamline your technical document review with AI.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className='tab-container'>
          <div className='flex justify-center mb-8'>
            <button
              onClick={() => setActiveTab("extract")}
              className={`py-3 px-8 rounded-t-lg font-semibold transition-colors tab-button ${
                activeTab === "extract"
                  ? "bg-black text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              📄 Data Extraction
            </button>
            <button
              onClick={() => setActiveTab("kb")}
              className={`py-3 px-8 rounded-t-lg font-semibold transition-colors tab-button ${
                activeTab === "kb"
                  ? "bg-black text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              📚 Knowledge Base
            </button>
            <button
              onClick={() => setActiveTab("ctd")}
              className={`py-3 px-8 rounded-t-lg font-semibold transition-colors tab-button ${
                activeTab === "ctd"
                  ? "bg-black text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              ⚗️ CTD Generator
            </button>
            <button
              onClick={() => setActiveTab("archive")}
              className={`py-3 px-8 rounded-t-lg font-semibold transition-colors tab-button ${
                activeTab === "archive"
                  ? "bg-black text-white"
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
            >
              📋 Review & Archive
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className='bg-gray-50 rounded-b-3xl rounded-tr-3xl tab-content border-t border-gray-300'>
          {/* Tab: Data Extraction */}
          {activeTab === "extract" && (
            <div className='space-y-6 section-spacing'>
              <div className='flex items-center gap-3 mb-6'>
                <h2 className='text-2xl font-bold text-black'>
                  📄 Data Extraction
                </h2>
              </div>
              <div className='content-spacing'>
                <div className='space-y-4 file-upload-section'>
                  <div>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='.txt,.doc,.docx,.pdf'
                      onChange={handleFileUpload}
                      className='hidden'
                    />
                    <button
                      type='button'
                      onClick={() => fileInputRef.current?.click()}
                      className='w-full bg-gray-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-gray-700 transition-colors flex items-center justify-center gap-3 shadow-md'
                    >
                      <span className='text-xl'>📁</span>
                      <span>Choose File</span>
                    </button>
                  </div>
                  {selectedFile && (
                    <div className='file-selected-indicator flex items-center gap-2'>
                      <span>✅</span> Selected file: {selectedFile.name}
                    </div>
                  )}
                </div>
                <div className='extract-button-container'>
                  <button
                    onClick={extractData}
                    disabled={isLoading || !rawText.trim()}
                    className='w-full bg-gray-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-gray-700 transition-colors flex items-center justify-center disabled:opacity-50'
                  >
                    {isLoading ? (
                      <>
                        <span>🔄 Extracting...</span>
                        <LoadingSpinner />
                      </>
                    ) : (
                      "🚀 Extract Data"
                    )}
                  </button>
                </div>
              </div>
              <h3 className='text-xl font-semibold text-gray-700 flex items-center gap-2'>
                <span>📊</span> Extracted Data:
              </h3>
              <pre className='bg-gray-800 text-green-400 p-4 rounded-lg overflow-x-auto text-sm min-h-[150px] transition-all duration-300 mt-2'>
                {extractedData
                  ? JSON.stringify(extractedData, null, 2)
                  : "No data extracted yet."}
              </pre>
              {extractedData && (
                <div className='content-spacing'>
                  <button
                    onClick={summarizeData}
                    disabled={isSummarizing}
                    className='w-full bg-sky-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-sky-700 transition-colors flex items-center justify-center disabled:opacity-50'
                  >
                    {isSummarizing ? (
                      <>
                        <span>🔄 Summarizing...</span>
                        <LoadingSpinner />
                      </>
                    ) : (
                      "✨ Summarize Extracted Data"
                    )}
                  </button>
                  {extractedDataSummary && (
                    <div className='content-spacing'>
                      <h3 className='text-xl font-semibold text-gray-700 flex items-center gap-2'>
                        <span>🤖</span> AI-Generated Summary:
                      </h3>
                      <pre className='bg-white p-4 rounded-lg whitespace-pre-wrap mt-2 border border-gray-300 text-gray-800'>
                        {extractedDataSummary}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Tab: Knowledge Base */}
          {activeTab === "kb" && (
            <div className='space-y-6 section-spacing'>
              <div className='flex items-center gap-3 mb-6'>
                <h2 className='text-2xl font-bold text-gray-800'>
                  📚 Reference Knowledge Base
                </h2>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-8 content-spacing'>
                <div className='bg-gray-100 p-6 rounded-xl shadow-inner card-spacing'>
                  <h3 className='text-xl font-bold text-gray-700 mb-4 flex items-center gap-2'>
                    <span>➕</span> Add New Reference Document
                  </h3>
                  <form onSubmit={addReferenceDocument} className='space-y-4'>
                    <div className='space-y-4'>
                      <div>
                        <input
                          ref={refFileInputRef}
                          type='file'
                          accept='.txt,.doc,.docx,.pdf'
                          onChange={handleRefFileUpload}
                          className='hidden'
                        />
                        <button
                          type='button'
                          onClick={() => refFileInputRef.current?.click()}
                          className='w-full bg-gray-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-gray-700 transition-colors flex items-center justify-center gap-3 shadow-md'
                        >
                          <span className='text-xl'>📁</span>
                          <span>Choose File</span>
                        </button>
                      </div>
                      {newRefDoc.summary && <div></div>}
                    </div>
                    <div className='flex space-x-2'>
                      <button
                        type='button'
                        onClick={populateReferenceFromText}
                        disabled={isPopulating}
                        className='flex-1 bg-sky-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-sky-700 transition-colors flex items-center justify-center disabled:opacity-50'
                      >
                        {isPopulating ? (
                          <>
                            <span>🔄 Populating...</span>
                            <LoadingSpinner />
                          </>
                        ) : (
                          "✨ Smart Populate"
                        )}
                      </button>
                      <button
                        type='submit'
                        disabled={isReferenceLoading || !newRefDoc.title}
                        className='flex-1 bg-green-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center disabled:opacity-50'
                      >
                        {isReferenceLoading ? (
                          <>
                            <span>💾 Adding...</span>
                            <LoadingSpinner />
                          </>
                        ) : (
                          "💾 Add to KB"
                        )}
                      </button>
                    </div>
                    <div className='horizontal-inputs'>
                      <input
                        type='text'
                        className='flex-1 p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500'
                        placeholder='📄 Document Title (e.g., USP Test Method)'
                        value={newRefDoc.title}
                        onChange={(e) =>
                          setNewRefDoc({ ...newRefDoc, title: e.target.value })
                        }
                      />
                      <input
                        type='text'
                        className='flex-1 p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500'
                        placeholder='🔢 Document Number (e.g., <1234>)'
                        value={newRefDoc.number}
                        onChange={(e) =>
                          setNewRefDoc({ ...newRefDoc, number: e.target.value })
                        }
                      />
                      <input
                        type='text'
                        className='flex-1 p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500'
                        placeholder='🧪 Comma-separated tests (e.g., Assay, Purity, Impurities)'
                        value={newRefDoc.tests}
                        onChange={(e) =>
                          setNewRefDoc({ ...newRefDoc, tests: e.target.value })
                        }
                      />
                    </div>
                  </form>
                </div>
                <div className='card-spacing'>
                  <h3 className='text-xl font-bold text-gray-700 mb-4 flex items-center gap-2'>
                    <span>📁</span> Your Reference Documents
                  </h3>
                  {referenceDocs.length > 0 ? (
                    <ul className='space-y-4'>
                      {referenceDocs.map((doc) => (
                        <li
                          key={doc.id}
                          className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer interactive-card ${
                            selectedRefDoc?.id === doc.id
                              ? "border-blue-600 bg-blue-50"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                          onClick={() => setSelectedRefDoc(doc)}
                        >
                          <div className='flex justify-between items-center'>
                            <span className='font-semibold text-gray-800 flex items-center gap-2'>
                              📄 {doc.title}
                            </span>
                            <span className='text-sm text-gray-500'>
                              ID: {doc.id.substring(0, 8)}...
                            </span>
                          </div>
                          <p className='text-gray-600 text-sm mt-1'>
                            {doc.summary.substring(0, 100)}...
                          </p>
                          <p className='text-blue-500 text-xs mt-2 flex items-center gap-1'>
                            {selectedRefDoc?.id === doc.id
                              ? "✅ Selected"
                              : "👆 Click to Select"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-gray-500 flex items-center gap-2'>
                      <span>📭</span> No reference documents found. Add one
                      using the form.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Tab: CTD Generator */}
          {activeTab === "ctd" && (
            <div className='space-y-6 section-spacing'>
              <div className='flex items-center gap-3 mb-6'>
                <h2 className='text-2xl font-bold text-gray-800'>
                  ⚗️ CTD & Discrepancy Generator
                </h2>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6 content-spacing'>
                <div className='bg-gray-100 p-4 rounded-xl card-spacing'>
                  <h3 className='font-semibold text-gray-700 mb-2 flex items-center gap-2'>
                    <span>📊</span> Extracted Data
                  </h3>
                  <pre className='bg-gray-800 text-green-400 p-3 rounded-lg text-sm h-40 overflow-x-auto'>
                    {extractedData
                      ? JSON.stringify(extractedData, null, 2)
                      : "No data extracted."}
                  </pre>
                </div>
                <div className='bg-gray-100 p-4 rounded-xl card-spacing'>
                  <h3 className='font-semibold text-gray-700 mb-2 flex items-center gap-2'>
                    <span>📚</span> Selected Reference
                  </h3>
                  <pre className='bg-gray-800 text-green-400 p-3 rounded-lg text-sm h-40 overflow-x-auto'>
                    {selectedRefDoc
                      ? JSON.stringify(selectedRefDoc, null, 2)
                      : "No reference selected."}
                  </pre>
                </div>
              </div>
              <div className='flex space-x-2 mt-4 content-spacing'>
                <button
                  onClick={compareAndGenerateOutput}
                  disabled={
                    isOutputLoading || !extractedData || !selectedRefDoc
                  }
                  className='flex-1 bg-purple-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center disabled:opacity-50'
                >
                  {isOutputLoading ? (
                    <>
                      <span>🔄 Generating...</span>
                      <LoadingSpinner />
                    </>
                  ) : (
                    "🚀 Generate Final Document"
                  )}
                </button>
                {generatedOutput && (
                  <button
                    onClick={critiqueOutput}
                    disabled={isCritiquing}
                    className='bg-yellow-500 text-white font-semibold py-3 px-6 rounded-xl hover:bg-yellow-600 transition-colors flex items-center justify-center disabled:opacity-50'
                  >
                    {isCritiquing ? (
                      <>
                        <span>🔄 Critiquing...</span>
                        <LoadingSpinner />
                      </>
                    ) : (
                      "💡 Suggest Improvements"
                    )}
                  </button>
                )}
              </div>
              <div className='content-spacing'>
                <h3 className='text-xl font-semibold text-gray-700 flex items-center gap-2'>
                  <span>{outputType === "CTD" ? "📄" : "⚠️"}</span>
                  {outputType === "CTD"
                    ? "Generated CTD Summary:"
                    : "Discrepancy Report:"}
                </h3>
                <pre
                  className={`p-4 rounded-lg overflow-x-auto whitespace-pre-wrap min-h-[200px] transition-all duration-300 mt-2 border ${
                    outputType === "Discrepancy"
                      ? "bg-red-50 border-red-300 text-red-800"
                      : "bg-white border-gray-300 text-gray-800"
                  }`}
                >
                  {generatedOutput ||
                    "The final CTD or a discrepancy report will appear here."}
                </pre>
              </div>
              {critiqueReport && (
                <div className='content-spacing'>
                  <h3 className='text-xl font-semibold text-gray-700 flex items-center gap-2'>
                    <span>🤖</span> AI-Generated Improvements:
                  </h3>
                  <pre className='bg-yellow-50 p-4 rounded-lg whitespace-pre-wrap mt-2 border border-yellow-300 text-gray-800'>
                    {critiqueReport}
                  </pre>
                </div>
              )}
              {generatedOutput && (
                <div className='flex space-x-2 mt-4 content-spacing'>
                  <button
                    onClick={saveFinalDocument}
                    disabled={isSavingOutput}
                    className='flex-1 bg-green-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center disabled:opacity-50'
                  >
                    {isSavingOutput ? (
                      <>
                        <span>💾 Saving...</span>
                        <LoadingSpinner />
                      </>
                    ) : (
                      "💾 Save Final Document"
                    )}
                  </button>
                  <button
                    onClick={speakOutput}
                    disabled={isPlaying}
                    className='flex-1 bg-purple-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center disabled:opacity-50'
                  >
                    {isPlaying ? (
                      <>
                        <span>🔊 Reading...</span>
                        <LoadingSpinner />
                      </>
                    ) : (
                      "🔊 Read Aloud"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Tab: Review & Archive */}
          {activeTab === "archive" && (
            <div className='space-y-6 section-spacing'>
              <div className='flex items-center gap-3 mb-6'>
                <h2 className='text-2xl font-bold text-gray-800'>
                  📋 Review & Archive
                </h2>
              </div>
              <p className='text-gray-600 content-spacing'>
                Browse and review your previously saved documents.
              </p>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-8 content-spacing'>
                <div className='card-spacing'>
                  <h3 className='text-xl font-bold text-gray-700 mb-4 flex items-center gap-2'>
                    <span>📁</span> Saved Documents
                  </h3>
                  {savedDocuments.length > 0 ? (
                    <ul className='space-y-4'>
                      {savedDocuments.map((doc) => (
                        <li
                          key={doc.id}
                          className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer interactive-card ${
                            selectedSavedDoc?.id === doc.id
                              ? "border-blue-600 bg-blue-50"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                          onClick={() => setSelectedSavedDoc(doc)}
                        >
                          <div className='flex justify-between items-center'>
                            <span className='font-semibold text-gray-800 flex items-center gap-2'>
                              <span>
                                {doc.outputType === "CTD" ? "📄" : "⚠️"}
                              </span>
                              {doc.outputType === "CTD"
                                ? "CTD Summary"
                                : "Discrepancy Report"}
                            </span>
                            <span className='text-sm text-gray-500'>
                              📅 {new Date(doc.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className='text-gray-600 text-sm mt-1'>
                            {doc.generatedOutput.substring(0, 100)}...
                          </p>
                          <p className='text-blue-500 text-xs mt-2 flex items-center gap-1'>
                            {selectedSavedDoc?.id === doc.id
                              ? "✅ Selected"
                              : "👆 Click to View"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-gray-500 flex items-center gap-2'>
                      <span>📭</span> No documents have been saved yet.
                    </p>
                  )}
                </div>
                {selectedSavedDoc && (
                  <div className='card-spacing'>
                    <h3 className='text-xl font-bold text-gray-700 mb-4 flex items-center gap-2'>
                      <span>🔍</span> Selected Document Details
                    </h3>
                    <div className='bg-gray-100 p-6 rounded-xl space-y-4'>
                      <p className='flex items-center gap-2'>
                        <span className='font-semibold'>📋 Type:</span>{" "}
                        {selectedSavedDoc.outputType}
                      </p>
                      <p className='flex items-center gap-2'>
                        <span className='font-semibold'>📅 Date Saved:</span>{" "}
                        {new Date(selectedSavedDoc.createdAt).toLocaleString()}
                      </p>
                      <div className='mt-4'>
                        <h4 className='font-semibold text-gray-700 flex items-center gap-2 mb-2'>
                          <span>📊</span> Original Extracted Data:
                        </h4>
                        <pre className='bg-gray-800 text-green-400 p-3 rounded-lg text-sm max-h-40 overflow-x-auto mt-2'>
                          {JSON.stringify(
                            selectedSavedDoc.extractedData,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                      <div className='mt-4'>
                        <h4 className='font-semibold text-gray-700 flex items-center gap-2 mb-2'>
                          <span>📄</span> Final Generated Output:
                        </h4>
                        <pre className='bg-white p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 mt-2 border border-gray-300'>
                          {selectedSavedDoc.generatedOutput}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <MessageBox message={message} />
      </div>
    </div>
  );
};

export default App;
