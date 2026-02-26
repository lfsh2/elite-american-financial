import React, { useState, useEffect } from 'react';
import { 
  Upload, ArrowRight, Check, X, AlertCircle, FileSpreadsheet, 
  ChevronDown, Download, RefreshCw, Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from './ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

interface CSVColumn {
  name: string;
  index: number;
  sampleValues: string[];
  mappedTo: string | null;
  isRequired: boolean;
}

interface ContactField {
  id: string;
  label: string;
  required: boolean;
  type: 'text' | 'email' | 'phone' | 'date' | 'address';
  description?: string;
}

interface ParsedContact {
  rowIndex: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
  selected: boolean;
}

const CONTACT_FIELDS: ContactField[] = [
  { id: 'firstName', label: 'First Name', required: false, type: 'text' },
  { id: 'lastName', label: 'Last Name', required: false, type: 'text' },
  { id: 'phoneNumber', label: 'Phone Number', required: true, type: 'phone', description: 'Required field' },
  { id: 'email', label: 'Email', required: false, type: 'email' },
  { id: 'birthday', label: 'Birthday', required: false, type: 'date' },
  { id: 'address', label: 'Address', required: false, type: 'address' },
  { id: 'city', label: 'City', required: false, type: 'text' },
  { id: 'state', label: 'State', required: false, type: 'text' },
  { id: 'zipCode', label: 'ZIP Code', required: false, type: 'text' },
  { id: 'country', label: 'Country', required: false, type: 'text' },
];

interface ContactImportMapperProps {
  onImportComplete: (contacts: any[]) => void;
  onCancel: () => void;
}

export default function ContactImportMapper({ onImportComplete, onCancel }: ContactImportMapperProps) {
  const { toast } = useToast();
  
  // Step management
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // CSV parsing state
  const [csvColumns, setCsvColumns] = useState<CSVColumn[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  
  // Mapping state
  const [fieldMappings, setFieldMappings] = useState<Record<string, number | null>>({});
  
  // Validation state
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);

  const steps = [
    { number: 1, title: 'Upload', description: 'Upload file and configure' },
    { number: 2, title: 'Map', description: 'Map columns to fields' },
    { number: 3, title: 'Verify', description: 'Confirm and finalize selection' },
  ];

  // Parse CSV line with proper quote handling
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive'
      });
      return;
    }

    setFile(uploadedFile);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const text = await uploadedFile.text();
      setUploadProgress(50);
      
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV must contain headers and at least one row');
      }

      const headers = parseCSVLine(lines[0]);
      const dataRows = lines.slice(1).map(line => parseCSVLine(line));
      
      setUploadProgress(75);

      // Auto-detect column mappings
      const columns: CSVColumn[] = headers.map((header, index) => {
        const sampleValues = dataRows.slice(0, 3).map(row => row[index] || '');
        const normalizedHeader = header.toLowerCase().trim();
        
        let mappedTo: string | null = null;
        
        // Smart mapping based on header names
        if (normalizedHeader.includes('first') && normalizedHeader.includes('name')) {
          mappedTo = 'firstName';
        } else if (normalizedHeader.includes('last') && normalizedHeader.includes('name')) {
          mappedTo = 'lastName';
        } else if (normalizedHeader.includes('phone') || normalizedHeader.includes('mobile') || normalizedHeader.includes('number')) {
          mappedTo = 'phoneNumber';
        } else if (normalizedHeader.includes('email') || normalizedHeader.includes('e-mail')) {
          mappedTo = 'email';
        } else if (normalizedHeader.includes('birthday') || normalizedHeader.includes('birth') || normalizedHeader.includes('dob')) {
          mappedTo = 'birthday';
        } else if (normalizedHeader.includes('address') && !normalizedHeader.includes('email')) {
          mappedTo = 'address';
        } else if (normalizedHeader.includes('city')) {
          mappedTo = 'city';
        } else if (normalizedHeader.includes('state')) {
          mappedTo = 'state';
        } else if (normalizedHeader.includes('zip') || normalizedHeader.includes('postal')) {
          mappedTo = 'zipCode';
        } else if (normalizedHeader.includes('country')) {
          mappedTo = 'country';
        }
        
        return {
          name: header,
          index,
          sampleValues,
          mappedTo,
          isRequired: false
        };
      });

      setCsvColumns(columns);
      setCsvData(dataRows);
      
      // Set initial field mappings
      const initialMappings: Record<string, number | null> = {};
      columns.forEach(col => {
        if (col.mappedTo) {
          initialMappings[col.mappedTo] = col.index;
        }
      });
      setFieldMappings(initialMappings);
      
      setUploadProgress(100);
      
      toast({
        title: 'File Uploaded',
        description: `Found ${headers.length} columns and ${dataRows.length} rows`,
      });
      
      setCurrentStep(2);
    } catch (error: any) {
      console.error('Error parsing CSV:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to parse the CSV file',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Update field mapping
  const updateFieldMapping = (fieldId: string, columnIndex: number | null) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldId]: columnIndex
    }));
  };

  // Validate phone number
  const validatePhoneNumber = (phone: string): boolean => {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  };

  // Validate email
  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Email is optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Parse and validate contacts based on mappings
  const parseAndValidateContacts = () => {
    const contacts: ParsedContact[] = csvData.map((row, index) => {
      const data: Record<string, string> = {};
      const errors: string[] = [];
      
      // Map standard fields
      Object.entries(fieldMappings).forEach(([fieldId, columnIndex]) => {
        if (columnIndex !== null && columnIndex < row.length) {
          data[fieldId] = row[columnIndex]?.trim() || '';
        }
      });
      
      // Map unmapped columns as custom fields
      const mappedColumnIndices = new Set(Object.values(fieldMappings).filter(idx => idx !== null));
      csvColumns.forEach((column) => {
        if (!mappedColumnIndices.has(column.index) && row[column.index]) {
          // Use the original column name as the custom field key
          const customFieldKey = column.name.replace(/\s+/g, '_');
          data[customFieldKey] = row[column.index]?.trim() || '';
        }
      });
      
      // Validate required fields
      if (!data.phoneNumber || !validatePhoneNumber(data.phoneNumber)) {
        errors.push('Invalid or missing phone number');
      }
      
      // Validate email if provided
      if (data.email && !validateEmail(data.email)) {
        errors.push('Invalid email format');
      }
      
      return {
        rowIndex: index + 2, // +2 because of header and 0-indexing
        data,
        isValid: errors.length === 0,
        errors,
        selected: errors.length === 0 // Auto-select valid contacts
      };
    });
    
    setParsedContacts(contacts);
    setValidCount(contacts.filter(c => c.isValid).length);
    setInvalidCount(contacts.filter(c => !c.isValid).length);
    setCurrentStep(3);
  };

  // Toggle contact selection
  const toggleContactSelection = (index: number) => {
    setParsedContacts(prev => prev.map((contact, i) => 
      i === index ? { ...contact, selected: !contact.selected } : contact
    ));
  };

  // Select all valid contacts
  const selectAllValid = () => {
    setParsedContacts(prev => prev.map(contact => ({
      ...contact,
      selected: contact.isValid
    })));
  };

  // Deselect all contacts
  const deselectAll = () => {
    setParsedContacts(prev => prev.map(contact => ({
      ...contact,
      selected: false
    })));
  };

  // Handle import
  const handleImport = () => {
    const selectedContacts = parsedContacts
      .filter(c => c.selected)
      .map(c => ({
        ...c.data,
        source: 'csv-import'
      }));
    
    if (selectedContacts.length === 0) {
      toast({
        title: 'No Contacts Selected',
        description: 'Please select at least one contact to import',
        variant: 'destructive'
      });
      return;
    }
    
    onImportComplete(selectedContacts);
  };

  // Download sample CSV
  const downloadSampleCSV = () => {
    const headers = ['First Name', 'Last Name', 'Phone Number', 'Email', 'City', 'State', 'ZIP Code'];
    const sampleData = [
      ['John', 'Doe', '+12345678901', 'john@example.com', 'New York', 'NY', '10001'],
      ['Jane', 'Smith', '+19876543210', 'jane@example.com', 'Los Angeles', 'CA', '90001'],
      ['Bob', 'Johnson', '+15551234567', 'bob@example.com', 'Chicago', 'IL', '60601'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = parsedContacts.filter(c => c.selected).length;

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                currentStep > step.number 
                  ? 'bg-green-500 border-green-500 text-white' 
                  : currentStep === step.number
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {currentStep > step.number ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="font-semibold">{step.number}</span>
                )}
              </div>
              <div>
                <p className={`font-medium ${currentStep >= step.number ? 'text-gray-900' : 'text-gray-400'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${currentStep > step.number ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload your files</CardTitle>
            <CardDescription>
              Before uploading files, make sure your file is ready to import.{' '}
              <button 
                onClick={downloadSampleCSV}
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Download sample file
                <Download className="h-3 w-3" />
              </button>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* File Upload Area */}
              <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-blue-400 transition-colors bg-gray-50">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                  disabled={isUploading}
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-blue-100 p-4 rounded-full">
                      <Upload className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        {isUploading ? 'Processing...' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        CSV files (Max 100MB)
                      </p>
                    </div>
                    {file && !isUploading && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>{file.name}</span>
                      </div>
                    )}
                  </div>
                </label>
                {isUploading && (
                  <Progress value={uploadProgress} className="mt-4 w-64 mx-auto" />
                )}
              </div>

              {/* Import Options */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Choose how to import contacts</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-blue-800">
                    <input type="radio" name="importMode" defaultChecked className="text-blue-600" />
                    <span>Create and update contacts</span>
                  </label>
                  <p className="text-xs text-blue-700 ml-6">
                    Recommended: Updates existing contacts and creates new ones
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map Fields */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns to fields</CardTitle>
            <CardDescription>
              Match your CSV columns to contact fields. Required fields are marked with *
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Mapping Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-1/3">CSV Column</TableHead>
                      <TableHead className="w-1/3">Maps to Field</TableHead>
                      <TableHead className="w-1/3">Sample Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvColumns.map((column) => {
                      const mappedField = CONTACT_FIELDS.find(f => 
                        Object.entries(fieldMappings).find(([fieldId, colIndex]) => 
                          fieldId === f.id && colIndex === column.index
                        )
                      );
                      
                      const isMapped = !!mappedField;
                      const willBeCustomField = !isMapped;
                      
                      return (
                        <TableRow key={column.index}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 text-gray-400" />
                              <span className="font-medium">{column.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mappedField?.id || 'custom'}
                              onValueChange={(value) => {
                                if (value === 'custom') {
                                  // Remove mapping - will be treated as custom field
                                  const newMappings = { ...fieldMappings };
                                  Object.keys(newMappings).forEach(key => {
                                    if (newMappings[key] === column.index) {
                                      delete newMappings[key];
                                    }
                                  });
                                  setFieldMappings(newMappings);
                                } else {
                                  updateFieldMapping(value, column.index);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select field..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="custom">
                                  <div className="flex items-center gap-2">
                                    <span className="text-blue-600">Custom Field</span>
                                    <Badge variant="outline" className="text-xs">
                                      {`{{${column.name.replace(/\s+/g, '_')}}}`}
                                    </Badge>
                                  </div>
                                </SelectItem>
                                {CONTACT_FIELDS.map(field => (
                                  <SelectItem key={field.id} value={field.id}>
                                    <div className="flex items-center gap-2">
                                      <span>{field.label}</span>
                                      {field.required && (
                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-600 space-y-1">
                              {column.sampleValues.slice(0, 2).map((value, i) => (
                                <div key={i} className="truncate max-w-[200px]">
                                  {value || <span className="text-gray-400 italic">empty</span>}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Custom Fields Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Custom Fields & Merge Tags</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Columns not mapped to standard fields will be imported as custom fields. 
                    You can use them in SMS messages as merge tags like <code className="bg-blue-100 px-1 rounded">{'{{Total_Debt_Amount}}'}</code>
                  </p>
                </div>
              </div>

              {/* Required Fields Warning */}
              {!fieldMappings.phoneNumber && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900">Phone Number field is required</p>
                    <p className="text-sm text-red-700 mt-1">
                      Please map at least one column to the Phone Number field to continue
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button 
                  onClick={parseAndValidateContacts}
                  disabled={!fieldMappings.phoneNumber}
                >
                  Continue to Verify
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verify */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm and finalize selection</CardTitle>
            <CardDescription>
              Review and select contacts to import. Invalid contacts are highlighted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700">Valid Contacts</p>
                      <p className="text-2xl font-bold text-green-900">{validCount}</p>
                    </div>
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-700">Invalid Contacts</p>
                      <p className="text-2xl font-bold text-red-900">{invalidCount}</p>
                    </div>
                    <X className="h-8 w-8 text-red-600" />
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700">Selected</p>
                      <p className="text-2xl font-bold text-blue-900">{selectedCount}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllValid}>
                    Select All Valid
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  {selectedCount} of {parsedContacts.length} contacts selected
                </p>
              </div>

              {/* Contacts Preview */}
              <div className="rounded-md border">
                <ScrollArea className="h-[400px] w-full">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox 
                              checked={selectedCount === validCount && validCount > 0}
                              onCheckedChange={(checked) => {
                                if (checked) selectAllValid();
                                else deselectAll();
                              }}
                            />
                          </TableHead>
                          <TableHead className="min-w-[60px]">Row</TableHead>
                          <TableHead className="min-w-[80px]">Status</TableHead>
                          <TableHead className="min-w-[130px]">Phone Number</TableHead>
                          <TableHead className="min-w-[100px]">First Name</TableHead>
                          <TableHead className="min-w-[100px]">Last Name</TableHead>
                          <TableHead className="min-w-[150px]">Email</TableHead>
                          {/* Show custom field headers */}
                          {parsedContacts.length > 0 && (() => {
                            const customFields = Object.keys(parsedContacts[0].data).filter(
                              key => !['phoneNumber', 'firstName', 'lastName', 'email', 'birthday', 'address', 'city', 'state', 'zipCode', 'country'].includes(key)
                            );
                            return customFields.slice(0, 3).map(field => (
                              <TableHead key={field} className="capitalize min-w-[120px]">
                                {field.replace(/_/g, ' ')}
                              </TableHead>
                            ));
                          })()}
                          <TableHead className="min-w-[150px]">Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                  <TableBody>
                    {parsedContacts.map((contact, index) => {
                      const customFields = Object.keys(contact.data).filter(
                        key => !['phoneNumber', 'firstName', 'lastName', 'email', 'birthday', 'address', 'city', 'state', 'zipCode', 'country'].includes(key)
                      );
                      
                      return (
                        <TableRow 
                          key={index}
                          className={!contact.isValid ? 'bg-red-50' : contact.selected ? 'bg-blue-50' : ''}
                        >
                          <TableCell>
                            <Checkbox 
                              checked={contact.selected}
                              onCheckedChange={() => toggleContactSelection(index)}
                              disabled={!contact.isValid}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{contact.rowIndex}</TableCell>
                          <TableCell>
                            {contact.isValid ? (
                              <Badge variant="default" className="bg-green-500">Valid</Badge>
                            ) : (
                              <Badge variant="destructive">Invalid</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">{contact.data.phoneNumber || '-'}</TableCell>
                          <TableCell>{contact.data.firstName || '-'}</TableCell>
                          <TableCell>{contact.data.lastName || '-'}</TableCell>
                          <TableCell>{contact.data.email || '-'}</TableCell>
                          {/* Show custom field values */}
                          {customFields.slice(0, 3).map(field => (
                            <TableCell key={field}>
                              {contact.data[field] || '-'}
                            </TableCell>
                          ))}
                          <TableCell>
                            {contact.errors.length > 0 && (
                              <div className="text-xs text-red-600 space-y-1">
                                {contact.errors.map((error, i) => (
                                  <div key={i} className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>{error}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  Back to Mapping
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleImport}
                    disabled={selectedCount === 0}
                  >
                    Import {selectedCount} Contact{selectedCount !== 1 ? 's' : ''}
                    <Check className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
