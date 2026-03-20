"use client";

import { useEffect, useMemo, useState } from "react";
import { getGeneralQuestions, getGeneralSectionTitle, getQuestionsForCategory, getSectionTitleForCategory, type FormState, type Option, type Question, type Section } from "@/lib/form-state";

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

function scopeKey(selectedCategoryId: string, path: string) {
  return path.startsWith("general__") ? "general" : selectedCategoryId;
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
  const [generalQuestionToggles, setGeneralQuestionToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    loadState().then((data) => {
      if (!active) return;
      setState(data);
      setSelectedCategoryId("");
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

  const generalSections = useMemo(() => {
    return state.sections
      .map((section) => ({ section, questions: getGeneralQuestions(section) }))
      .filter((entry) => entry.questions.length > 0);
  }, [state.sections]);

  const categorySections = useMemo(() => {
    if (!selectedCategoryId) return [] as Array<{ section: Section; questions: Question[] }>;
    return state.sections
      .map((section) => ({ section, questions: getQuestionsForCategory(section, selectedCategoryId) }))
      .filter((entry) => entry.questions.length > 0);
  }, [selectedCategoryId, state.sections]);

  const hasCategorySpecificQuestions = useMemo(() => {
    return state.sections.some((section) =>
      section.categoryQuestions.some((group) => group.questions.length > 0),
    );
  }, [state.sections]);

  function collectSubCheckboxValues(name: string) {
    const selected: string[] = [];
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
    boxes.forEach((box) => {
      if (box.checked) selected.push(box.value);
    });
    return selected;
  }

  function getSubDropdownValue(id: string) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    return select?.value || "";
  }

  function formatOptionAnswer(questionPath: string, option: Option) {
    const baseField = fieldKey(scopeKey(selectedCategoryId, questionPath), questionPath);

    if (option.followUp === "text") {
      const follow = document.getElementById(`${baseField}__f_${option.id}`) as HTMLInputElement | null;
      const value = follow?.value.trim() || "";
      return value ? `${option.text}: ${value}` : option.text;
    }

    if (option.followUp === "subcheckbox") {
      const values = collectSubCheckboxValues(`${baseField}__sub_${option.id}`);
      return values.length ? `${option.text}: ${values.join(", ")}` : option.text;
    }

    if (option.followUp === "subdropdown") {
      const value = getSubDropdownValue(`${baseField}__sd_${option.id}`);
      return value ? `${option.text}: ${value}` : option.text;
    }

    return option.text;
  }

  function validateQuestion(sectionTitle: string, question: Question, path: string, answers: Answer[]) {
    const field = fieldKey(scopeKey(selectedCategoryId, path), path);
    const errors: string[] = [];
    const isGeneralToggleQuestion = path.startsWith("general__") && question.type !== "text";

    if (isGeneralToggleQuestion && !generalQuestionToggles[field]) {
      return errors;
    }

    if (question.type === "text") {
      const input = document.getElementById(field) as HTMLInputElement | null;
      const value = input?.value.trim() || "";
      if (question.required && !value) errors.push(field);
      answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(value), includeInCopy: question.includeInCopy });
      return errors;
    }

    if (question.type === "subdropdown") {
      const select = document.getElementById(field) as HTMLSelectElement | null;
      const option = question.options.find((item) => String(item.id) === String(select?.value));
      if (question.required && !option) errors.push(field);
      answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(option ? formatOptionAnswer(path, option) : ""), includeInCopy: question.includeInCopy });

      if (option?.followUp === "text") {
        const follow = document.getElementById(`${field}__f_${option.id}`) as HTMLInputElement | null;
        if (option.followRequired && !(follow?.value.trim() || "")) errors.push(field);
      }

      if (option?.followUp === "subcheckbox") {
        const values = collectSubCheckboxValues(`${field}__sub_${option.id}`);
        if (option.subRequired && !values.length) errors.push(field);
      }

      if (option?.followUp === "subdropdown") {
        const value = getSubDropdownValue(`${field}__sd_${option.id}`);
        if (option.subRequired && !value) errors.push(field);
      }

      if (option) {
        option.childQuestions.forEach((childQuestion) => {
          errors.push(...validateQuestion(sectionTitle, childQuestion, `${path}__${option.id}__${childQuestion.id}`, answers));
        });
      }

      return errors;
    }

    const checkboxOptions = question.options.filter((option) => option.inputType !== "dropdown");
    const dropdownOptions = question.options.filter((option) => option.inputType === "dropdown");
    const selectedIds: string[] = [];
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(`${field}__check`)}"]`);
    boxes.forEach((box) => {
      if (box.checked) selectedIds.push(box.value);
    });
    const selectedCheckboxOptions = checkboxOptions.filter((option) => selectedIds.includes(option.id));
    const dropdownValue = getSubDropdownValue(`${field}__dropdown`);
    const selectedDropdownOption = dropdownOptions.find((option) => option.id === dropdownValue);
    const selectedOptions = selectedDropdownOption
      ? [...selectedCheckboxOptions, selectedDropdownOption]
      : selectedCheckboxOptions;

    if (question.required && !selectedOptions.length) errors.push(field);

    selectedOptions.forEach((option) => {
      if (option.followUp === "text") {
        const follow = document.getElementById(`${field}__f_${option.id}`) as HTMLInputElement | null;
        if (option.followRequired && !(follow?.value.trim() || "")) errors.push(field);
      }

      if (option.followUp === "subcheckbox") {
        const values = collectSubCheckboxValues(`${field}__sub_${option.id}`);
        if (option.subRequired && !values.length) errors.push(field);
      }

      if (option.followUp === "subdropdown") {
        const value = getSubDropdownValue(`${field}__sd_${option.id}`);
        if (option.subRequired && !value) errors.push(field);
      }
    });

    answers.push({ section: sectionTitle, question: isPlaceholderLabel(question.label) ? "" : question.label, answer: getAnswerText(selectedOptions.map((option) => formatOptionAnswer(path, option))), includeInCopy: question.includeInCopy });
    return errors;
  }

  function validateAndCollect() {
    const answers: Answer[] = [];
    const errors: string[] = [];
    generalSections.forEach(({ section, questions }) => {
      const sectionTitle = getGeneralSectionTitle(section) || "Untitled Section";
      questions.forEach((question) => {
        errors.push(...validateQuestion(sectionTitle, question, `general__${question.id}`, answers));
      });
    });

    if (hasCategorySpecificQuestions && !selectedCategoryId) {
      setFieldErrors([]);
      setGlobalError("Please choose a category to continue.");
      return { ok: false as const };
    }

    categorySections.forEach(({ section, questions }) => {
      const sectionTitle = getSectionTitleForCategory(section, selectedCategoryId) || "Untitled Section";
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
      return <div className="follow"><label className="questionLabel">Please specify:</label><input id={`${fieldKey(scopeKey(selectedCategoryId, questionPath), questionPath)}__f_${option.id}`} type="text" /></div>;
    }
    if (option.followUp === "subdropdown") {
      return <div className="follow"><label className="questionLabel">Select one:</label><select id={`${fieldKey(scopeKey(selectedCategoryId, questionPath), questionPath)}__sd_${option.id}`} defaultValue=""><option value="">Select...</option>{option.subOptions.map((subOption, index) => <option key={`${option.id}_sd_${index}`} value={subOption.text}>{subOption.text}</option>)}</select></div>;
    }
    return <div className="follow"><div className="muted">Select all that apply:</div><div className="subchecks">{option.subOptions.map((subOption, index) => { const id = `${fieldKey(scopeKey(selectedCategoryId, questionPath), questionPath)}__sub_${option.id}_${index}`; return <div className="subitem" key={id}><input type="checkbox" id={id} name={`${fieldKey(scopeKey(selectedCategoryId, questionPath), questionPath)}__sub_${option.id}`} value={subOption.text} /><label htmlFor={id}>{subOption.text}</label></div>; })}</div></div>;
  }

  function renderQuestion(question: Question, path: string, inline = false): React.JSX.Element {
    const field = fieldKey(scopeKey(selectedCategoryId, path), path);
    const hasError = fieldErrors.includes(field);
    const showLabel = !inline && question.type != "subdropdown" && Boolean(question.label);
    const isGeneralToggleQuestion = path.startsWith("general__") && question.type !== "text";
    const isEnabled = !isGeneralToggleQuestion || Boolean(generalQuestionToggles[field]);

    if (question.type === "text") {
      return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}<input id={field} type="text" /></div>;
    }

    const toggleControl = isGeneralToggleQuestion ? <div className="checkitem"><input type="checkbox" id={`${field}__toggle`} checked={Boolean(generalQuestionToggles[field])} onChange={(event) => setGeneralQuestionToggles((current) => ({ ...current, [field]: event.target.checked }))} /><div className="checkitemBody"><label htmlFor={`${field}__toggle`}>{question.label || "Question"}</label></div></div> : null;

    if (question.type === "subdropdown") {
      const selectedOption = question.options.find((option) => option.id === dropdownSelections[field]);
      return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{toggleControl}{!isGeneralToggleQuestion && showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}{isEnabled ? <><select id={field} defaultValue="" onChange={(event) => setDropdownSelections((current) => ({ ...current, [field]: event.target.value }))}><option value="">Select sub option...</option>{question.options.map((option) => <option key={option.id} value={option.id}>{option.text || "Option"}</option>)}</select>{renderFollowUp(path, selectedOption)}{selectedOption?.childQuestions.length ? <div className="nestedInlineWrap">{selectedOption.childQuestions.map((childQuestion) => renderQuestion(childQuestion, `${path}__${selectedOption.id}__${childQuestion.id}`, true))}</div> : null}</> : null}</div>;
    }

    const checkboxOptions = question.options.filter((option) => option.inputType !== "dropdown");
    const dropdownOptions = question.options.filter((option) => option.inputType === "dropdown");
    const selectedDropdownOption = dropdownOptions.find((option) => option.id === dropdownSelections[`${field}__dropdown`]);
    let dropdownRendered = false;

    return <div className={inline ? "inlineQuestion" : "userQuestion"} key={path}>{toggleControl}{!isGeneralToggleQuestion && showLabel ? <label className="questionLabel" htmlFor={field}>{question.label}{question.required ? " *" : ""}</label> : null}{hasError ? <div className="error">This field is required.</div> : null}{isEnabled ? <div className="checklist" id={field}>{question.options.map((option, index) => {
      if (option.inputType === "dropdown") {
        if (dropdownRendered) return null;
        dropdownRendered = true;
        return <div className="follow" key={`${field}_dropdown_group`}><select id={`${field}__dropdown`} defaultValue="" onChange={(event) => setDropdownSelections((current) => ({ ...current, [`${field}__dropdown`]: event.target.value }))}><option value="">Select...</option>{dropdownOptions.map((dropdownOption) => <option key={dropdownOption.id} value={dropdownOption.id}>{dropdownOption.text || "Option"}</option>)}</select>{renderFollowUp(path, selectedDropdownOption)}</div>;
      }

      const checkboxId = `${field}_check_${index}`;
      return <div className="checkitem" key={checkboxId}><input type="checkbox" id={checkboxId} name={`${field}__check`} value={option.id} onChange={(event) => setCheckedOptions((current) => ({ ...current, [checkboxId]: event.target.checked }))} /><div className="checkitemBody"><label htmlFor={checkboxId}>{option.text || "Option"}</label>{checkedOptions[checkboxId] ? renderFollowUp(path, option) : null}</div></div>;
    })}</div> : null}</div>;
  }

  if (loading) return <main className="shell"><section className="card"><div className="cardBody"><p className="muted">Loading form...</p></div></section></main>;

  return (
    <>
      <header className="topbar"><h1>User Form</h1></header>
      <main className="shell">
        <section className="card" style={{ display: previewAnswers ? "none" : undefined }}>
          <div className="cardHeader"><h2>Fill the form</h2><span className="muted">Submit to preview your answers</span></div>
          <div className="cardBody">
            <form>
              {generalSections.map(({ section, questions }) => <div className="userSection" key={`general_${section.id}`}><div className="userSectionTitle">{getGeneralSectionTitle(section) || "Untitled Section"}</div>{questions.map((question) => renderQuestion(question, `general__${question.id}`))}</div>)}
              {state.categories.length && hasCategorySpecificQuestions ? <div className="row filterRow"><div className="selectCell"><label>Choose Category</label><select value={selectedCategoryId} onChange={(event) => { setSelectedCategoryId(event.target.value); setPreviewAnswers(null); setFieldErrors([]); setGlobalError(""); }}><option value="">Select category</option>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div> : null}
              {selectedCategoryId ? categorySections.map(({ section, questions }) => <div className="userSection" key={`${selectedCategoryId}_${section.id}`}><div className="userSectionTitle">{getSectionTitleForCategory(section, selectedCategoryId) || "Untitled Section"}</div>{questions.map((question) => renderQuestion(question, question.id))}</div>) : null}
            </form>
            {!generalSections.length && !hasCategorySpecificQuestions ? <p className="muted">No questions available.</p> : null}
            {hasCategorySpecificQuestions && !selectedCategoryId ? <p className="muted">Select a category to continue with category-specific questions.</p> : null}
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

