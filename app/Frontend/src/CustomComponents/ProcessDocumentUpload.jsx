import React, { useRef, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import CustomButton from "./CustomButton";
import {
  GenerateDocumentName,
  uploadDocumentInProcess,
  uploadDocumentsInProcessFinal,
} from "../common/Apis";
import { toast } from "react-toastify";
import TopLoader from "../common/Loader/TopLoader";

export default function ProcessDocumentUpload({
  processId,
  workflowId,
  issueNo,
  onFinish,
}) {
  const [documents, setDocuments] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      file: null,
      preApproved: false,
      customName: "",
      description: "",
      partNumber: "",
      docIssueNo: "",
      newTag: "",
      tags: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "tags",
    control,
  });

  const preApproved = watch("preApproved");
  const selectedFile = watch("file");

  // ---------------- ADD TAG ----------------
  const handleAddTag = () => {
    const tagValue = watch("newTag").trim();

    if (tagValue && !fields.some((t) => t.value === tagValue)) {
      append({ value: tagValue });
      setValue("newTag", "");
    }
  };

  // ---------------- ADD DOCUMENT ----------------
  const onAddDocument = async (data) => {
    if (actionsLoading) return;

    const file = data.file;

    if (!file) {
      toast.info("Select a file");
      return;
    }

    setActionsLoading(true);

    const ext = file.name.split(".").pop();
    let generatedName;

    if (data.preApproved) {
      if (!data.customName.trim()) {
        toast.info("Enter document name");
        setActionsLoading(false);
        return;
      }
      generatedName = `${data.customName.trim()}.${ext}`;
    } else {
      try {
        const res = await GenerateDocumentName(workflowId, null, ext);
        generatedName = res?.data?.documentName;
      } catch (err) {
        toast.error("Name generation failed");
        setActionsLoading(false);
        return;
      }
    }

    // Upload File
    let uploadRes;
    try {
      uploadRes = await uploadDocumentInProcess(
        [file],
        generatedName,
        fields.map((t) => t.value)
      );
      toast.success("Document Added");
    } catch (err) {
      toast.error("Upload failed");
      setActionsLoading(false);
      return;
    }

    // Save document
    setDocuments((prev) => [
      ...prev,
      {
        documentId: uploadRes[0],
        name: generatedName,
        tags: fields.map((t) => t.value),
        description: data.description,
        partNumber: data.partNumber,
        issueNo: data.docIssueNo,
        preApproved: data.preApproved,
      },
    ]);

    reset();
    setActionsLoading(false);
  };

  // ---------------- FINAL SUBMIT ----------------
  const handleFinalSubmit = async () => {
    if (documents.length === 0) {
      toast.info("Add at least one document");
      return;
    }

    setActionsLoading(true);

    try {
      const res = await uploadDocumentsInProcessFinal({
        processId,
        issueNo,
        documents,
      });
      toast.success(res?.data?.message);
      onFinish(res.data);
    } catch (err) {
      toast.error("Final submit failed");
    }

    setActionsLoading(false);
  };

  return (
    <div>
      {actionsLoading && <TopLoader />}

      <h2 className="text-xl font-semibold mb-4">Upload Documents</h2>

      <form onSubmit={handleSubmit(onAddDocument)} className="space-y-4">
        {/* FILE INPUT USING CONTROLLER */}
        <Controller
          control={control}
          name="file"
          render={({ field }) => (
            <input
              type="file"
              disabled={actionsLoading}
              onChange={(e) => field.onChange(e.target.files[0])}
            />
          )}
        />

        {/* PRE-APPROVED CHECKBOX */}
        <Controller
          control={control}
          name="preApproved"
          render={({ field }) => (
            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              />
              <label>Pre-Approved Document?</label>
            </div>
          )}
        />

        {/* CUSTOM NAME (ONLY IF PRE-APPROVED) */}
        {preApproved && (
          <Controller
            control={control}
            name="customName"
            render={({ field }) => (
              <input
                {...field}
                placeholder="Enter Document Name"
                className="border p-2 rounded w-full"
              />
            )}
          />
        )}

        {/* DESCRIPTION */}
        <Controller
          control={control}
          name="description"
          rules={{ required: true }}
          render={({ field }) => (
            <input
              {...field}
              placeholder="Enter Description"
              className="border p-2 rounded w-full"
            />
          )}
        />
        {errors.description && <p className="text-red-500">Required</p>}

        {/* PART NUMBER */}
        <Controller
          control={control}
          name="partNumber"
          render={({ field }) => (
            <input
              {...field}
              placeholder="Enter Part Number"
              className="border p-2 rounded w-full"
            />
          )}
        />

        {/* ISSUE NO */}
        <Controller
          control={control}
          name="docIssueNo"
          render={({ field }) => (
            <input
              {...field}
              placeholder="Enter Issue No"
              className="border p-2 rounded w-full"
            />
          )}
        />

        {/* TAG INPUT */}
        <Controller
          control={control}
          name="newTag"
          render={({ field }) => (
            <div className="flex gap-2">
              <input
                {...field}
                placeholder="Add Tag"
                className="border p-2 rounded"
              />
              <CustomButton type="button" text="Add" click={handleAddTag} />
            </div>
          )}
        />

        {/* TAG LIST */}
        <div className="flex flex-wrap gap-2 mt-2">
          {fields.map((tag, index) => (
            <span
              key={tag.id}
              className="px-3 py-1 bg-blue-200 rounded-full text-sm flex items-center gap-2"
            >
              {tag.value}
              <button
                type="button"
                className="text-red-600"
                onClick={() => remove(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* ADD DOCUMENT */}
        <CustomButton type="submit" className="w-full" text="Add Document" />
      </form>

      {/* DOCUMENT LIST */}
      <div className="mt-4 border p-3 rounded-xl max-h-40 overflow-y-auto">
        {documents.length === 0 ? (
          <p className="text-gray-500 text-sm text-center">
            No documents added yet
          </p>
        ) : (
          documents.map((doc, idx) => (
            <div key={idx} className="p-2 border-b text-sm space-y-1">
              <p>
                <strong>Name:</strong> {doc.name}
              </p>
              <p>
                <strong>Description:</strong> {doc.description}
              </p>
              <p>
                <strong>Part:</strong> {doc.partNumber}
              </p>
              <p>
                <strong>Issue No:</strong> {doc.issueNo}
              </p>
              <p>
                <strong>Tags:</strong> {doc.tags.join(", ")}
              </p>
            </div>
          ))
        )}
      </div>

      {/* FINAL SUBMIT */}
      <CustomButton
        className="w-full mt-4"
        text="Finish & Submit"
        click={handleFinalSubmit}
      />
    </div>
  );
}
