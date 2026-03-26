import React, { useState, useRef, useEffect } from 'react';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import {
 IconX,
 IconMail,
 IconUser,
 IconClock,
 IconPaperclip,
 IconAt,
 IconCalendar,
 IconDownload,
 IconChevronDown,
 IconChevronUp,
 IconSearch,
 IconCopy,
 IconEye,
 IconFileText,
 IconUsers,
 IconTag,
 IconMaximize,
 IconMinimize,
 IconCheck,
 IconPrinter,
} from '@tabler/icons-react';
import CustomPopover from '../../CustomComponents/CustomPopover';


const SafeHTMLRenderer = ({ html, className = '' }) => {
 const cleanHTML = (htmlString) => {
   if (!htmlString) return '';


   let cleaned = htmlString;


   // Remove signature div if it contains "Regards" pattern
   cleaned = cleaned.replace(
     /<div[^>]*class=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
     '',
   );
   cleaned = cleaned.replace(
     /<div[^>]*id=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
     '',
   );


   // Remove mailer signatures
   cleaned = cleaned.replace(
     /<div[^>]*gmail_signature["'][^>]*>[\s\S]*?<\/div>/gi,
     '',
   );
   cleaned = cleaned.replace(
     /<div[^>]*gmail_extra["'][^>]*>[\s\S]*?<\/div>/gi,
     '',
   );


   // Basic HTML sanitization
   cleaned = cleaned
     .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
     .replace(/on\w+="[^"]*"/gi, '')
     .replace(/javascript:/gi, '');


   return cleaned;
 };


 const createMarkup = () => {
   const cleanedHTML = cleanHTML(html);
   return { __html: cleanedHTML };
 };


 return (
   <div
     className={`prose prose-sm prose-slate max-w-none break-words text-slate-700 ${className}`}
     dangerouslySetInnerHTML={createMarkup()}
     style={{
       maxHeight: '400px',
       wordBreak: 'break-word',
       overflowWrap: 'break-word',
     }}
   />
 );
};


export const normalizeRecipients = (recipients) => {
 if (!recipients) return [];


 if (Array.isArray(recipients)) {
   return recipients;
 }


 // Try to parse string representation of array
 if (typeof recipients === 'string') {
   try {
     // Handle format like "['recipient1@domain.com', 'recipient2@domain.com']"
     if (recipients.startsWith('[') && recipients.endsWith(']')) {
       const parsed = JSON.parse(recipients.replace(/'/g, '"'));
       return Array.isArray(parsed) ? parsed : [parsed];
     }
     // Handle format like "recipient1@domain.com, recipient2@domain.com"
     return recipients
       .split(',')
       .map((r) => r.trim())
       .filter((r) => r);
   } catch (error) {
     // If parsing fails, return as single item array
     return [recipients];
   }
 }


 return [];
};


const EmailThreadModal = ({ thread, onClose, onViewDocument }) => {
 console.log(thread);


 const [expandedEmails, setExpandedEmails] = useState({});
 const [expandedAddresses, setExpandedAddresses] = useState({
   to: {},
 });
 const [searchQuery, setSearchQuery] = useState('');
 const [viewMode, setViewMode] = useState('timeline');
 const [copiedText, setCopiedText] = useState(null);
 const contentRef = useRef(null);


 // Initialize all emails as expanded by default
 useEffect(() => {
   if (thread?.emails) {
     const initialExpanded = {};
     thread.emails.forEach((_, index) => {
       initialExpanded[index] = true;
     });
     setExpandedEmails(initialExpanded);
   }


   // Auto-scroll to top when modal opens
   if (contentRef.current) {
     contentRef.current.scrollTop = 0;
   }
 }, [thread]);


 const toggleEmailExpansion = (index) => {
   setExpandedEmails((prev) => ({
     ...prev,
     [index]: !prev[index],
   }));
 };


 const toggleAllEmails = () => {
   const allExpanded = Object.values(expandedEmails).every(Boolean);
   const newExpanded = {};
   thread.emails.forEach((_, index) => {
     newExpanded[index] = !allExpanded;
   });
   setExpandedEmails(newExpanded);
 };


 const formatDate = (date) => {
   if (!date) return 'Date unknown';


   try {
     const now = new Date();
     const emailDate = new Date(date);
     const diffTime = Math.abs(now - emailDate);
     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));


     if (diffDays === 0) {
       return `Today at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
     } else if (diffDays === 1) {
       return `Yesterday at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
     } else if (diffDays <= 7) {
       return `${diffDays} days ago`;
     }
     return emailDate.toLocaleDateString([], {
       year: 'numeric',
       month: 'short',
       day: 'numeric',
       hour: '2-digit',
       minute: '2-digit',
     });
   } catch (error) {
     return date;
   }
 };


 // Parse email address from various formats
 const parseEmailAddress = (addr) => {
   if (!addr) return { name: 'Unknown', email: '' };


   // Format 1: "('Bhavik Bhatt', 'bhavik.bhatt@ssbi.in')"
   const tupleMatch = addr.match(/\('(.*?)',\s*'(.*?)'\)/);
   if (tupleMatch) {
     return {
       name: tupleMatch[1],
       email: tupleMatch[2],
     };
   }


   // Format 2: "Name <email@domain.com>"
   const angleMatch = addr.match(/(.*?)\s*<(.*?)>/);
   if (angleMatch) {
     return {
       name: angleMatch[1].trim(),
       email: angleMatch[2].trim(),
     };
   }


   // Format 3: Just email
   if (addr.includes('@')) {
     return {
       name: addr.split('@')[0],
       email: addr,
     };
   }


   // Default
   return {
     name: addr,
     email: '',
   };
 };


 const formatEmailAddress = (addr) => {
   const parsed = parseEmailAddress(addr);
   return (
     <div className="truncate inline-flex items-baseline gap-1.5 max-w-[200px] sm:max-w-xs md:max-w-md">
       <strong className="text-slate-800 font-semibold">{parsed.name}</strong>
       {parsed.email && (
         <span className="text-xs font-medium text-slate-500 truncate">
           &lt;{parsed.email}&gt;
         </span>
       )}
     </div>
   );
 };


 // Normalize recipients - handle array or string


 const filteredEmails =
   thread?.emails?.filter((email) => {
     if (!searchQuery.trim()) return true;
     const searchLower = searchQuery.toLowerCase();


     const emailText =
       email.body_plain || email.bodyText || email.body_text || '';
     const toRecipients = normalizeRecipients(email.to);
     const ccRecipients = normalizeRecipients(email.cc);


     return (
       (email.subject?.toLowerCase() || '').includes(searchLower) ||
       (email.from?.toLowerCase() || '').includes(searchLower) ||
       emailText.toLowerCase().includes(searchLower) ||
       toRecipients.some((to) => to.toLowerCase().includes(searchLower)) ||
       ccRecipients.some((cc) => cc.toLowerCase().includes(searchLower))
     );
   }) || [];


 const totalAttachments = thread?.attachmentsMapping?.length || 0;


 if (!thread) return null;


 return (
   <CustomModal
     isOpen={!!thread}
     onClose={onClose}
     className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl"
     title="Email Thread Details"
   >
     <div className="flex flex-col h-full bg-slate-50/30">
      
       {/* Header */}
       <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-5 shadow-sm">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center border border-indigo-100/50 shadow-inner">
               <IconMail className="text-indigo-600" size={24} stroke={1.5} />
             </div>
             <div>
               <h2 className="font-bold text-xl text-slate-900 leading-tight">
                 Email Conversation
               </h2>
               <div className="flex items-center gap-3 text-sm text-slate-500 font-medium mt-1">
                 <span className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-0.5 rounded-md">
                   <IconUsers size={14} />
                   {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
                 </span>
                 <span className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-0.5 rounded-md">
                   <IconPaperclip size={14} />
                   {totalAttachments} attachment{totalAttachments !== 1 ? 's' : ''}
                 </span>
               </div>
             </div>
           </div>


           <div className="flex items-center gap-3">
             <button
               onClick={toggleAllEmails}
               className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
             >
               {Object.values(expandedEmails).every(Boolean)
                 ? 'Collapse All'
                 : 'Expand All'}
             </button>
             <div className="relative group">
               <IconSearch
                 className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"
                 size={18}
               />
               <input
                 type="text"
                 placeholder="Search in emails..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl w-64 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm text-slate-700 placeholder-slate-400"
               />
             </div>
           </div>
         </div>


         {/* Thread info bar */}
         <div className="flex flex-wrap items-center gap-4 text-sm bg-indigo-50/50 border border-indigo-100/50 p-3 rounded-xl">
           <div className="flex items-center gap-2 w-full">
             <IconTag size={18} className="text-indigo-500 flex-shrink-0" stroke={1.5} />
             <span className="font-semibold text-slate-700 flex-shrink-0">Subject Thread:</span>
             <span className="text-indigo-900 font-medium truncate">
               {thread.emails?.[0]?.subject ||
                 thread.threadText ||
                 'Untitled Thread'}
             </span>
           </div>
         </div>
       </div>


       {/* Content */}
       <div ref={contentRef} className="flex-1 overflow-auto p-6 scroll-smooth">
        
         {/* Timeline View */}
         {viewMode === 'timeline' && (
           <div className="relative pl-10 space-y-8 max-w-5xl mx-auto">
             {/* Timeline line */}
             <div className="absolute left-[1.35rem] top-6 bottom-4 w-[2px] bg-slate-200 rounded-full"></div>


             {filteredEmails.map((email, index) => {
               const isExpanded = expandedEmails[index];
               const isSearchMatch =
                 searchQuery &&
                 ((email.subject?.toLowerCase() || '').includes(
                   searchQuery.toLowerCase(),
                 ) ||
                   (
                     email.body_plain?.toLowerCase() ||
                     email.bodyText?.toLowerCase() ||
                     ''
                   ).includes(searchQuery.toLowerCase()));


               // Get email-specific attachments from attachmentsMapping
               const emailAttachments =
                 thread.attachmentsMapping?.filter(
                   (att) =>
                     att.emailSubject === email.subject &&
                     att.emailFrom === email.from,
                 ) ||
                 email.attachments_filenames?.map((filename) => ({
                   filename,
                   originalFilename: filename,
                 })) ||
                 [];


               return (
                 <div key={index} className="relative group/email">
                   {/* Timeline dot */}
                   <div className="absolute -left-[3.35rem] top-4 z-10">
                     <div
                       className={`w-9 h-9 rounded-full border-[3px] flex items-center justify-center text-xs font-bold shadow-sm transition-all duration-300 ${
                         isSearchMatch
                           ? 'bg-amber-100 border-amber-300 text-amber-800 scale-110'
                           : 'bg-white border-indigo-200 text-indigo-600 group-hover/email:border-indigo-400'
                       }`}
                     >
                       {index + 1}
                     </div>
                   </div>


                   {/* Email Card */}
                   <div
                     className={`border rounded-2xl shadow-sm overflow-hidden transition-all duration-300 bg-white ${
                       isSearchMatch
                         ? 'border-amber-300 ring-4 ring-amber-50'
                         : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'
                     }`}
                   >
                     {/* Header */}
                     <div
                       className="p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                       onClick={() => toggleEmailExpansion(index)}
                     >
                       <div className="flex justify-between items-start gap-4">
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-3 mb-4">
                             <h3 className="font-bold text-lg text-slate-900 truncate">
                               {email.subject || 'No Subject'}
                             </h3>
                             {emailAttachments.length > 0 && (
                               <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">
                                 <IconPaperclip size={12} stroke={2} />
                                 {emailAttachments.length}
                               </span>
                             )}
                           </div>


                           <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 text-sm">
                             <div className="space-y-2.5">
                               {/* From */}
                               <div className="flex items-center">
                                 <div className="w-16 flex items-center gap-1.5 text-slate-400 font-semibold">
                                   <IconUser size={14} stroke={2} />
                                   <span>From</span>
                                 </div>
                                 <div className="flex-1 pl-2 border-l-2 border-slate-100">
                                   {formatEmailAddress(email.from)}
                                 </div>
                               </div>


                               {/* TO / CC / BCC */}
                               {email.to && (() => {
                                 const recipients = normalizeRecipients(email.to);
                                 const ccRecipients = normalizeRecipients(email.cc);
                                 const bccRecipients = normalizeRecipients(email.bcc);
                                 const isExpanded = expandedAddresses.to[index];
                                 const visibleRecipients = isExpanded ? recipients : recipients.slice(0, 2);
                                 const totalRecipients = recipients.length + ccRecipients.length + bccRecipients.length;


                                 return (
                                   <div className="space-y-2.5">
                                     {/* TO */}
                                     <div className="flex items-start">
                                       <div className="w-16 flex items-center gap-1.5 mt-0.5 text-slate-400 font-semibold">
                                         <IconAt size={14} stroke={2} />
                                         <span>To</span>
                                       </div>
                                       <div className="flex-1 pl-2 border-l-2 border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1">
                                         {visibleRecipients.map((addr, i) => (
                                           <div key={`${addr}-${i}`} className="bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                                             {formatEmailAddress(addr)}
                                           </div>
                                         ))}


                                         {totalRecipients > 2 && (
                                           <button
                                             onClick={(e) => {
                                               e.stopPropagation();
                                               setExpandedAddresses((prev) => ({
                                                 ...prev,
                                                 to: {
                                                   ...prev.to,
                                                   [index]: !prev.to[index],
                                                 },
                                               }));
                                             }}
                                             className="ml-1 px-2.5 py-1 font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors text-xs"
                                           >
                                             {isExpanded ? 'Show less' : `+${totalRecipients - 2} more`}
                                           </button>
                                         )}
                                       </div>
                                     </div>


                                     {/* CC */}
                                     {isExpanded && ccRecipients?.length > 0 && (
                                       <div className="flex items-start">
                                         <div className="w-16 flex items-center gap-1.5 mt-0.5 text-slate-400 font-semibold">
                                           <IconAt size={14} stroke={2} />
                                           <span>Cc</span>
                                         </div>
                                         <div className="flex-1 pl-2 border-l-2 border-slate-100 flex flex-wrap gap-x-2 gap-y-1">
                                           {ccRecipients.map((addr, i) => (
                                             <div key={`${addr}-${i}`} className="bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                                               {formatEmailAddress(addr)}
                                             </div>
                                           ))}
                                         </div>
                                       </div>
                                     )}


                                     {/* BCC */}
                                     {isExpanded && bccRecipients?.length > 0 && (
                                       <div className="flex items-start">
                                         <div className="w-16 flex items-center gap-1.5 mt-0.5 text-slate-400 font-semibold">
                                           <IconAt size={14} stroke={2} />
                                           <span>Bcc</span>
                                         </div>
                                         <div className="flex-1 pl-2 border-l-2 border-slate-100 flex flex-wrap gap-x-2 gap-y-1">
                                           {bccRecipients.map((addr, i) => (
                                             <div key={`${addr}-${i}`} className="bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                                               {formatEmailAddress(addr)}
                                             </div>
                                           ))}
                                         </div>
                                       </div>
                                     )}
                                   </div>
                                 );
                               })()}
                             </div>
                            
                             <div className="flex justify-start lg:justify-end items-start mt-2 lg:mt-0">
                               <div className="flex items-center gap-2 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                 <IconCalendar size={16} stroke={1.5} />
                                 <span className="font-semibold text-slate-700">
                                   {formatDate(email.date)}
                                 </span>
                               </div>
                             </div>
                           </div>
                         </div>


                         <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
                           {isExpanded ? (
                             <IconChevronUp size={20} />
                           ) : (
                             <IconChevronDown size={20} />
                           )}
                         </div>
                       </div>
                     </div>


                     {/* Expanded Content */}
                     {isExpanded && (
                       <div className="border-t border-slate-100">
                         {/* Attachments */}
                         {/* {emailAttachments.length > 0 && (
                           <div className="p-5 bg-slate-50/50 border-b border-slate-100">
                             <div className="flex items-center gap-2 mb-3">
                               <IconPaperclip size={18} className="text-slate-500" />
                               <h4 className="font-bold text-slate-700">Attachments ({emailAttachments.length})</h4>
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                               {emailAttachments.map((attachment, idx) => (
                                 <div
                                   key={idx}
                                   className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all group/att"
                                 >
                                   <div className="flex items-center gap-3 min-w-0">
                                     <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover/att:bg-indigo-600 group-hover/att:text-white transition-colors">
                                       <IconFileText size={20} stroke={1.5} />
                                     </div>
                                     <div className="min-w-0">
                                       <p className="font-semibold text-sm text-slate-800 truncate">
                                         {attachment.originalFilename || attachment.filename}
                                       </p>
                                       <p className="text-xs font-medium text-slate-500">
                                         {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Size unknown'}
                                       </p>
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/att:opacity-100 transition-opacity">
                                     {onViewDocument && attachment.documentId && (
                                       <button
                                         onClick={() => onViewDocument(attachment.documentId)}
                                         className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                         title="View Document"
                                       >
                                         <IconEye size={18} stroke={1.5} />
                                       </button>
                                     )}
                                     <button
                                       onClick={() => {
                                         console.log('Download attachment:', attachment);
                                       }}
                                       className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                       title="Download"
                                     >
                                       <IconDownload size={18} stroke={1.5} />
                                     </button>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                         )} */}


                         {/* Email Body */}
                         {(email.body_plain ||
                           email.body_html ||
                           email.bodyText ||
                           email.body_text) && (
                           <div className="p-5 bg-white">
                             <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                               <h4 className="font-bold text-slate-400 uppercase tracking-wider text-xs">
                                 Message Body
                               </h4>
                               <button
                                 onClick={() => {
                                   const text =
                                     email.body_plain ||
                                     email.bodyText ||
                                     email.body_text ||
                                     '';
                                   navigator.clipboard.writeText(text);
                                   setCopiedText('Email content');
                                   setTimeout(() => setCopiedText(null), 2000);
                                 }}
                                 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                               >
                                 {copiedText === 'Email content' ? (
                                   <>
                                     <IconCheck size={16} stroke={2} />
                                     Copied
                                   </>
                                 ) : (
                                   <>
                                     <IconCopy size={16} stroke={2} />
                                     Copy Raw Text
                                   </>
                                 )}
                               </button>
                             </div>
                             <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                               <SafeHTMLRenderer
                                 html={
                                   email.body_html ||
                                   email.body_plain ||
                                   email.bodyText ||
                                   email.body_text
                                 }
                               />
                             </div>
                           </div>
                         )}
                       </div>
                     )}
                   </div>
                 </div>
               );
             })}
           </div>
         )}


         {/* Compact View */}
         {viewMode === 'compact' && (
           <div className="space-y-4 max-w-5xl mx-auto">
             {filteredEmails.map((email, index) => {
               const emailAttachments =
                 thread.attachmentsMapping?.filter(
                   (att) =>
                     att.emailSubject === email.subject &&
                     att.emailFrom === email.from,
                 ) || [];


               return (
                 <div
                   key={index}
                   className="border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all bg-white"
                 >
                   <div className="flex justify-between items-start gap-4">
                     <div className="space-y-3 flex-1 min-w-0">
                       <h4 className="font-bold text-lg text-slate-900 truncate">
                         {email.subject || 'No Subject'}
                       </h4>
                       <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                         <div className="flex items-center gap-2">
                           <IconUser size={16} className="text-slate-400" />
                           <strong className="text-slate-700">From:</strong>
                           <span className="truncate max-w-[200px]">{formatEmailAddress(email.from)}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <IconCalendar size={16} className="text-slate-400" />
                           <strong className="text-slate-700">Date:</strong>
                           <span>{formatDate(email.date)}</span>
                         </div>
                         {emailAttachments.length > 0 && (
                           <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-semibold text-xs border border-indigo-100">
                             <IconPaperclip size={14} />
                             {emailAttachments.length} att.
                           </div>
                         )}
                       </div>
                     </div>
                     <button
                       onClick={() => toggleEmailExpansion(index)}
                       className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 whitespace-nowrap"
                     >
                       {expandedEmails[index] ? 'Collapse' : 'Expand Preview'}
                       {expandedEmails[index] ? <IconChevronUp size={16}/> : <IconChevronDown size={16}/>}
                     </button>
                   </div>


                   {expandedEmails[index] &&
                     (email.body_plain ||
                       email.bodyText ||
                       email.body_text) && (
                       <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-600 max-h-40 overflow-y-auto leading-relaxed">
                         {(
                           email.body_plain ||
                           email.bodyText ||
                           email.body_text ||
                           ''
                         ).substring(0, 300)}
                         {(
                           email.body_plain ||
                           email.bodyText ||
                           email.body_text ||
                           ''
                         ).length > 300
                           ? '...'
                           : ''}
                       </div>
                     )}
                 </div>
               );
             })}
           </div>
         )}
       </div>


       {/* Footer */}
       <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur-md px-6 py-4">
         <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
             Showing <span className="font-bold text-slate-800">{filteredEmails.length}</span> of <span className="font-bold text-slate-800">{thread.emails?.length}</span> emails
             {searchQuery && <span className="text-indigo-600 ml-1">(filtered by "{searchQuery}")</span>}
           </div>
           <div className="flex items-center gap-3 w-full sm:w-auto">
             <button
               onClick={() =>
                 setViewMode(viewMode === 'timeline' ? 'compact' : 'timeline')
               }
               className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
             >
               {viewMode === 'timeline' ? (
                 <IconMinimize size={18} className="text-slate-400" />
               ) : (
                 <IconMaximize size={18} className="text-slate-400" />
               )}
               {viewMode === 'timeline' ? 'Compact View' : 'Timeline View'}
             </button>
             <button
               onClick={onClose}
               className="flex-1 sm:flex-none px-8 py-2.5 font-bold text-sm text-white bg-slate-900 rounded-xl hover:bg-slate-800 hover:shadow-lg transition-all shadow-sm"
             >
               Close Thread
             </button>
           </div>
         </div>
       </div>
     </div>
    
     {/* Optional: Add custom scrollbar styling globally or in a CSS file to make the prose scrollbar cleaner */}
     <style dangerouslySetInnerHTML={{__html: `
       .custom-scrollbar::-webkit-scrollbar {
         width: 6px;
       }
       .custom-scrollbar::-webkit-scrollbar-track {
         background: transparent;
       }
       .custom-scrollbar::-webkit-scrollbar-thumb {
         background-color: #cbd5e1;
         border-radius: 20px;
       }
       .custom-scrollbar::-webkit-scrollbar-thumb:hover {
         background-color: #94a3b8;
       }
     `}} />
   </CustomModal>
 );
};


export default EmailThreadModal;

