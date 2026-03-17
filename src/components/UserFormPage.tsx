"use client";

import { useEffect, useMemo, useState } from "react";
import { getQuestionsForCategory, type FormState, type Option, type Question, type Section } from "@/lib/form-state";

type Answer = {
  section: string;
  question: string;
  answer: string;
  includeInCopy: boolean;
};

async function loadState() {
  try {
    const response = await fetch("/api/form", { cache: "no-store" });
    if (!response.ok) return { categories: [], sections: [] } satisfies FormState;
    const data = (await response.json()) as FormState;
    return Array.isArray(data.sections) ? data : { categories: [], sections: [] };
  } catch {
    return { categories: [], sections: [] };
  }
}

function fieldKey(categoryId: string, path: string) {
  return `q_${categoryId}_${path}`;
}

function getAnswerText(value: string | string[]) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(none)";
  return value || "(empty)";
}

function isPlaceholderLabel(label: string) {
  const value = label.trim();
  return !value || /^New\s.+question$/i.test(value);
}

function buildCopyText(categoryName: string, answers: Answer[]) {
  const grouped = new Map<string, Answer[]>();
  answers.filter((answer) => answer.includeInCopy).forEach((answer) => {
    if (!grouped.has(answer.section)) grouped.set(answer.section, []);
    grouped.get(answer.section)?.push(answer);
  });

  const lines: string[] = [];
  if (categoryName) {
    lines.push(`Category: ${categoryName}`);
    lines.push("");
  }

  for (const [section, items] of grouped.entries()) {
    lines.push(section);
    lines.push("-".repeat(Math.min(40, section.length + 6)));
    items.forEach((item) => lines.push(item.question ? `${item.question}: ${item.answer}` : `${item.answer}`));
    lines.push("");
  }

  return lines.join("\n");
}

export default function UserFormPage() {
  const [state, setState] = useState<FormState>({ categories: [], sections: [] });
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewAnswers, setPreviewAnswers] = useState<Answer[] | null>(null);
  const [toast, setToast] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [globalError, setGlobalError] = useState("");
  const [dropdownSelections, setDropdownSelections] = useState<Record<string, string>>({});
  const [checkedOptions, setCheckedOptions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    loadState().then((data) => {
      if (!active) return;
      setState(data);
      setSelectedCategoryId(data.categories[0]?.id || "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedCategoryName = state.categories.find((category) => category.id === selectedCategoryId)?.name || "";

  const visibleSections = useMemo(() => {
    if (!selectedCategoryId) return [] as Array<{ section: Section; questions: Question[] }>;
    return state.sections
      .map((section) => ({ section, questions: getQuestionsForCategory(section, selectedCategoryId) }))
      .filter((entry) => entry.questions.length > 0);
  }, [selectedCategoryId, state.sections]);

  function collectSubCheckboxValues(name: string) {
    const selected: string[] = [];
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
    boxes.forEach((box) => {
      if (box.checked) selected.push(box.value);
    });
    return selected;
  }

  function validateQuestion(sectionTitle: string, question: Question, path: string, answers: Answer[]) {
    const field = fieldKey(selectedCategoryId, path);
    const errors: string[] = [];

    if (question.type === "text") {
      const input = document.getElementById(field) as HTMLInputElement | null;
      const value = input?.value.trim() || "";
      if (question.required && !value) errors.push(field);
      answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(value), includeInCopy: question.includeInCopy });
      return errors;
    }

    if (question.type === "dropdown" || question.type === "subdropdown") {
      const select = document.getElementById(field) as HTMLSelectElement | null;
      const option = question.options.find((item) => String(item.id) === String(select?.value));
      if (question.required && !option) errors.push(field);
      answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(option?.text || ""), includeInCopy: question.includeInCopy });

      if (option?.followUp === "text") {
        const follow = document.getElementById(`${field}__f_${option.id}`) as HTMLInputElement | null;
        if (option.followRequired && !(follow?.value.trim() || "")) errors.push(field);
      }

      if (option?.followUp === "subcheckbox") {
        const values = collectSubCheckboxValues(`${field}__sub_${option.id}`);
        if (option.subRequired && !values.length) errors.push(field);
      }

      if (question.type === "subdropdown" && option) {
        option.childQuestions.forEach((childQuestion) => {
          errors.push(...validateQuestion(sectionTitle, childQuestion, `${path}__${option.id}__${childQuestion.id}`, answers));
        });
      }

      return errors;
    }

    const selectedIds: string[] = [];
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(field)}"]`);
    boxes.forEach((box) => {
      if (box.checked) selectedIds.push(box.value);
    });
    const selectedOptions = question.options.filter((option) => selectedIds.includes(option.id));
    if (question.required && !selectedOptions.length) errors.push(field);
    answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(selectedOptions.map((option) => option.text)), includeInCopy: question.includeInCopy });
    return errors;
  }

  function validateAndCollect() {
    const answers: Answer[] = [];
    const errors: string[] = [];
    visibleSections.forEach(({ section, questions }) => {
      const sectionTitle = section.title || "Untitled Section";
      questions.forEach((question) => {
        errors.push(...validateQuestion(sectionTitle, question, question.id, answers));
      });
    });

    setFieldErrors(errors);
    if (errors.length) {
      setGlobalError("Please fill all required fields.");
      const first = document.getElementById(errors[0]);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus();
      return { ok: false as const };
    }

    setGlobalError("");
    return { ok: true as const, answers };
  }

  async function copyPreview() {
    if (!previewAnswers) return;
    const text = buildCopyText(selectedCategoryName, previewAnswers);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setToast("Copied!");
  }

  function renderFollowUp(questionPath: string, option: Option | undefined) {
    if (!option || option.followUp === "none") return null;
    if (option.followUp === "text") {
      return <div className="follow"><label className="questionLabel">Please specify:</label><input id={`${fieldKey(selectedCategoryId, questionPath)}__f_${option.id}`} type="text" /></div>;
    }
    return <div className="follow"><div className="muted">Select all that apply:</div><div className="subchecks">{option.subOptions.map((subOption, index) => { const id = `${fieldKey(selectedCategoryId, questionPath)}__sub_${option.id}_${index}`; return <div className="subitem" key={id}><input type="checkbox" id={id} name={`${fieldKey(selectedCategoryId, questionPath)}__sub_${option.id}`} value={subOption.text} /><label htmlFor={id}>{subOption.text}</label></div>; })}</div></div>;
  }

  function renderQuestion(question: Question, path: string, inline = false): React.JSX.Element {
    const field = fieldKey(selectedCategoryId, path);
    const hasError = fieldErrors.includes(field);
    const showLabel = !inline && question.type != "subdropdown" && Boolean(question.label);

    if (question.type === "text") {
      return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}<input id={field} type="text" /></div>;
    }

    if (question.type === "dropdown" || question.type === "subdropdown") {
      const selectedOption = question.options.find((option) => option.id === dropdownSelections[field]);
      return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}<select id={field} defaultValue="" onChange={(event) => setDropdownSelections((current) => ({ ...current, [field]: event.target.value }))}><option value="">{question.type === "subdropdown" ? "Select sub option..." : "Select..."}</option>{question.options.map((option) => <option key={option.id} value={option.id}>{option.text || "Option"}</option>)}</select>{renderFollowUp(path, selectedOption)}{question.type === "subdropdown" && selectedOption?.childQuestions.length ? <div className="nestedInlineWrap">{selectedOption.childQuestions.map((childQuestion) => renderQuestion(childQuestion, `${path}__${selectedOption.id}__${childQuestion.id}`, true))}</div> : null}</div>;
    }

    return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}<div className="checklist">{question.options.map((option, index) => { const checkboxId = `${field}_${index}`; return <div className="checkitem" key={checkboxId}><input type="checkbox" id={checkboxId} name={field} value={option.id} onChange={(event) => setCheckedOptions((current) => ({ ...current, [checkboxId]: event.target.checked }))} /><div className="checkitemBody"><label htmlFor={checkboxId}>{option.text || "Option"}</label>{checkedOptions[checkboxId] ? renderFollowUp(path, option) : null}</div></div>; })}</div></div>;
  }

  if (loading) return <main className="shell"><section className="card"><div className="cardBody"><p className="muted">Loading form...</p></div></section></main>;

  return (
    <>
      <header className="topbar"><h1>User Form</h1></header>
      <main className="shell">
        <section className="card" style={{ display: previewAnswers ? "none" : undefined }}>
          <div className="cardHeader"><h2>Fill the form</h2><span className="muted">Submit to preview your answers</span></div>
          <div className="cardBody">
            {state.categories.length ? <div className="row filterRow"><div className="selectCell"><label>Category Filter</label><select value={selectedCategoryId} onChange={(event) => { setSelectedCategoryId(event.target.value); setPreviewAnswers(null); setFieldErrors([]); setGlobalError(""); }}><option value="">Select category</option>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div> : null}
            {visibleSections.length ? <form>{visibleSections.map(({ section, questions }) => <div className="userSection" key={`${selectedCategoryId}_${section.id}`}><div className="userSectionTitle">{section.title || "Untitled Section"}</div>{questions.map((question) => renderQuestion(question, question.id))}</div>)}</form> : <p className="muted">No questions available for the selected category.</p>}
            <div className="actions"><button className="primaryButton" type="button" onClick={() => { const result = validateAndCollect(); if (result.ok) setPreviewAnswers(result.answers); }}>Submit</button><button className="dangerButton" type="button" onClick={() => window.location.reload()}>Reset</button></div>
            {globalError ? <div className="error globalError">{globalError}</div> : null}
          </div>
        </section>

        <section className="card" style={{ display: previewAnswers ? undefined : "none" }}>
          <div className="cardHeader"><h2>Preview</h2><span className="muted">{selectedCategoryName || "Selected category"}</span></div>
          <div className="cardBody">
            {previewAnswers ? Array.from(previewAnswers.filter((answer) => answer.includeInCopy).reduce((map, answer) => { if (!map.has(answer.section)) map.set(answer.section, [] as Answer[]); map.get(answer.section)?.push(answer); return map; }, new Map<string, Answer[]>()).entries()).map(([sectionTitle, items]) => <div className="userSection" key={sectionTitle}><div className="userSectionTitle">{sectionTitle}</div>{items.map((item, index) => <div className="previewRow" key={`${item.question}_${index}`}>{item.question ? <div className="previewQuestion">{item.question}</div> : null}<div>{item.answer}</div></div>)}</div>) : null}
            <div className="actions"><button className="primaryButton" type="button" onClick={copyPreview}>Copy</button><button className="dangerButton" type="button" onClick={() => window.location.reload()}>Reset</button><button className="ghostButton" type="button" onClick={() => setPreviewAnswers(null)}>Back to edit</button></div>
          </div>
        </section>
      </main>
      <div className={`toast${toast ? " visible" : ""}`}>{toast}</div>
    </>
  );
}

