"use client";

import { useEffect, useState } from "react";
import {
  defaultState,
  smartDefaultFollowUp,
  type FollowUpType,
  type FormState,
  type Option,
  type OptionInputType,
  type Question,
  type QuestionType,
} from "@/lib/form-state";

const GENERAL_SCOPE_ID = "__general__";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function moveStringItem<T>(items: T[], index: number, direction: number) {
  const next = [...items];
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= next.length) return items;
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

function moveItem<T>(items: T[], index: number, direction: number) {
  const next = [...items];
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= next.length) return items;
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

function cloneQuestions(questions: Question[]) {
  const cloned = structuredClone(questions);
  const refresh = (list: Question[]) => {
    list.forEach((question) => {
      question.id = uid();
      question.options.forEach((option) => {
        option.id = uid();
        refresh(option.childQuestions);
      });
    });
  };
  refresh(cloned);
  return cloned;
}

function blankQuestion(type: QuestionType, blankLabel = false): Question {
  return {
    id: uid(),
    type,
    label: blankLabel
      ? ""
      : type === "text"
        ? "New text question"
        : type === "dropdown"
          ? "New dropdown question"
          : type === "checkbox"
            ? "New checkbox question"
            : "",
    required: false,
    includeInCopy: true,
    options: [],
    showInlineDropdown: false,
  };
}

function blankOption(text: string, inputType: OptionInputType): Option {
  return {
    id: uid(),
    text,
    inputType,
    followUp: smartDefaultFollowUp(text) as FollowUpType,
    followRequired: false,
    subRequired: false,
    subOptions: [],
    childQuestions: [],
  };
}

function createSection(title: string, state: FormState, mainOptionId?: string, categoryOwnerId?: string) {
  return {
    id: uid(),
    title,
    generalTitle: title,
    mainOptionId,
    categoryOwnerId,
    generalQuestions: [],
    categoryQuestions: state.categories.map((category) => ({ categoryId: category.id, title, questions: [] })),
  };
}

function syncDropdownSections(state: FormState) {
  const next = structuredClone(state);
  const generalOptionIds = new Set(next.mainSectionOptions.map((option) => option.id));
  const categoryOptionIds = new Map(next.categories.map((category) => [category.id, new Set(category.mainSectionOptions.map((option) => option.id))]));

  next.sections = next.sections.filter((section) => {
    if (!section.mainOptionId) return true;
    if (section.categoryOwnerId) {
      return categoryOptionIds.get(section.categoryOwnerId)?.has(section.mainOptionId) ?? false;
    }
    return generalOptionIds.has(section.mainOptionId);
  });

  next.sections.forEach((section) => {
    next.categories.forEach((category) => {
      const bucket = section.categoryQuestions.find((group) => group.categoryId === category.id);
      if (!bucket) {
        section.categoryQuestions.push({ categoryId: category.id, title: section.title || section.generalTitle || "", questions: [] });
      }
    });
  });

  return next;
}

function defaultCategoryState(name: string, id: string) {
  return {
    id,
    name,
    mainSectionTitle: "Main Section",
    mainSectionInputType: "checkbox" as const,
    mainSectionOptions: [],
  };
}

async function apiLoad() {
  const response = await fetch("/api/form", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as FormState;
  if (!data || !Array.isArray(data.sections)) return defaultState();
  return { ...defaultState(), ...data };
}

async function apiSave(state: FormState) {
  const response = await fetch("/api/form", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Save failed");
  }
}

type EditorProps = {
  question: Question;
  onChange: (question: Question) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  optionInputId: string;
  depth?: number;
};

function QuestionEditor({
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  optionInputId,
  depth = 0,
}: EditorProps) {
  const isChoice = question.type !== "text";
  const hideQuestionMeta = question.type == "subdropdown" || depth > 0;
  const showCopyOnly = hideQuestionMeta;

  return (
    <div className={`questionCard nestedDepth${Math.min(depth, 3)}`}>
      <div className="questionTop">
        <div>
          <div className="pill">{question.type.toUpperCase()}</div>
          <div className="muted questionHint">Question</div>
        </div>
        <div className="sectionActions">
          <button className="smallButton" type="button" onClick={onMoveUp}>
            Up
          </button>
          <button className="smallButton" type="button" onClick={onMoveDown}>
            Down
          </button>
          <button className="dangerButton smallButton" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {!hideQuestionMeta ? (
        <>
          <div className="row">
            <div className="grow">
              <label>Question Text</label>
              <input
                type="text"
                value={question.label}
                onChange={(event) => onChange({ ...question, label: event.target.value })}
              />
            </div>
            <div className="selectCell">
              <label>Required?</label>
              <select
                value={String(question.required)}
                onChange={(event) => onChange({ ...question, required: event.target.value === "true" })}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div className="selectCell">
              <label className="copyToggle">
                <input
                  type="checkbox"
                  checked={question.includeInCopy}
                  onChange={(event) => onChange({ ...question, includeInCopy: event.target.checked })}
                />
                <span>Include In Copy Note</span>
              </label>
            </div>
          </div>
          {question.type === "dropdown" ? (
            <div className="row">
              <div className="selectCell">
                <label>Inline visibility</label>
                <label className="copyToggle">
                  <input
                    type="checkbox"
                    checked={question.showInlineDropdown}
                    onChange={(event) => onChange({ ...question, showInlineDropdown: event.target.checked })}
                  />
                  <span>Always show dropdown (skip main checkbox)</span>
                </label>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showCopyOnly ? (
        <div className="row">
          <div className="selectCell">
            <label className="copyToggle">
              <input
                type="checkbox"
                checked={question.includeInCopy}
                onChange={(event) => onChange({ ...question, includeInCopy: event.target.checked })}
              />
              <span>Include In Copy Note</span>
            </label>
          </div>
        </div>
      ) : null}

      {isChoice ? (
        <>
          <div className="divider" />
          <div className="row">
            <div className="grow">
              <label>{question.type === "subdropdown" ? "Add Sub Option" : "Add Option"}</label>
              <input id={optionInputId} type="text" placeholder={question.type === "subdropdown" ? "e.g., 1-10 / 11-20" : "e.g., Option A"} />
            </div>
            {question.type === "checkbox" ? (
              <div className="selectCell">
                <label>Option Type</label>
                <select id={`${optionInputId}__type`} defaultValue="checkbox">
                  <option value="checkbox">Checkbox</option>
                  <option value="dropdown">Dropdown</option>
                </select>
              </div>
            ) : question.type === "dropdown" ? (
              <div className="selectCell">
                <label>Option Type</label>
                <div className="muted">New entries will always render as a dropdown.</div>
              </div>
            ) : null}
            <div className="buttonCell">
              <label>&nbsp;</label>
              <button
                className="primaryButton"
                type="button"
                onClick={() => {
                  const input = document.getElementById(optionInputId) as HTMLInputElement | null;
                  const value = input?.value.trim() || "";
                  if (!value) return;
                  const optionType: OptionInputType =
                      question.type === "subdropdown"
                        ? "checkbox"
                        : question.type === "dropdown"
                          ? "dropdown"
                          : ((document.getElementById(`${optionInputId}__type`) as HTMLSelectElement | null)?.value === "dropdown" ? "dropdown" : "checkbox");
                  onChange({ ...question, options: [...question.options, blankOption(value, optionType)] });
                  if (input) input.value = "";
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {question.options.length ? (
            question.options.map((option, optionIndex) => (
              <div className="optionBlock" key={option.id}>
                <div className="optionRow">
                  <input
                    type="text"
                    value={option.text}
                    onChange={(event) => {
                      const options = [...question.options];
                      options[optionIndex] = { ...option, text: event.target.value };
                      onChange({ ...question, options });
                    }}
                  />
                  <div className="optionTools">
                    {question.type !== "subdropdown" ? (
                      <>
                        <select
                          value={option.inputType}
                          onChange={(event) => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              inputType: event.target.value as OptionInputType,
                            };
                            onChange({ ...question, options });
                          }}
                        >
                          <option value="checkbox">Checkbox</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                        <select
                          value={option.followUp}
                          onChange={(event) => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              followUp: event.target.value as FollowUpType,
                            };
                            onChange({ ...question, options });
                          }}
                        >
                          <option value="none">No follow-up</option>
                          <option value="text">Text box</option>
                          <option value="subcheckbox">Sub-checkboxes</option>
                          <option value="subdropdown">Sub-dropdown</option>
                        </select>
                      </>
                    ) : (
                      <span className="muted">Sub option</span>
                    )}
                    <button
                      className="smallButton"
                      type="button"
                      onClick={() => onChange({ ...question, options: moveItem(question.options, optionIndex, -1) })}
                    >
                      Up
                    </button>
                    <button
                      className="smallButton"
                      type="button"
                      onClick={() => onChange({ ...question, options: moveItem(question.options, optionIndex, 1) })}
                    >
                      Down
                    </button>
                    <button
                      className="dangerButton smallButton"
                      type="button"
                      onClick={() => {
                        const options = question.options.filter((_, index) => index != optionIndex);
                        onChange({ ...question, options });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {question.type !== "subdropdown" && option.followUp === "text" ? (
                  <div className="nestedWrap">
                    <div className="row">
                      <div className="selectCell">
                        <label>Text Follow-up</label>
                        <select
                          value={option.followRequired ? "required" : "optional"}
                          onChange={(event) => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              followRequired: event.target.value === "required",
                            };
                            onChange({ ...question, options });
                          }}
                        >
                          <option value="optional">Optional</option>
                          <option value="required">Required</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {question.type !== "subdropdown" && option.followUp === "subcheckbox" ? (
                  <div className="nestedWrap">
                    <div className="row">
                      <div className="selectCell">
                        <label>Sub Checkbox Mode</label>
                        <select
                          value={option.subRequired ? "required" : "optional"}
                          onChange={(event) => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              subRequired: event.target.value === "required",
                            };
                            onChange({ ...question, options });
                          }}
                        >
                          <option value="optional">Sub Optional</option>
                          <option value="required">Sub Required</option>
                        </select>
                      </div>
                    </div>

                    <div className="muted">Sub-checkbox options (user will tick these):</div>

                    <div className="row">
                      <div className="grow">
                        <label>Add Sub-option</label>
                        <input
                          id={`${optionInputId}_${option.id}_sub`}
                          type="text"
                          placeholder="e.g., HR / Admin / Finance"
                        />
                      </div>
                      <div className="buttonCell">
                        <label>&nbsp;</label>
                        <button
                          className="primaryButton"
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(
                              `${optionInputId}_${option.id}_sub`,
                            ) as HTMLInputElement | null;
                            const value = input?.value.trim() || "";
                            if (!value) return;

                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              subOptions: [...option.subOptions, { text: value }],
                            };
                            onChange({ ...question, options });

                            if (input) input.value = "";
                          }}
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {option.subOptions.length ? (
                      option.subOptions.map((subOption, subOptionIndex) => (
                        <div className="optionRow" key={`${option.id}_sub_${subOptionIndex}`}>
                          <input
                            type="text"
                            value={subOption.text}
                            onChange={(event) => {
                              const options = [...question.options];
                              const subOptions = [...option.subOptions];
                              subOptions[subOptionIndex] = { text: event.target.value };
                              options[optionIndex] = { ...option, subOptions };
                              onChange({ ...question, options });
                            }}
                          />
                          <div className="optionTools">
                            <button
                              className="dangerButton smallButton"
                              type="button"
                              onClick={() => {
                                const options = [...question.options];
                                options[optionIndex] = {
                                  ...option,
                                  subOptions: option.subOptions.filter(
                                    (_, index) => index !== subOptionIndex,
                                  ),
                                };
                                onChange({ ...question, options });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="muted">No sub-checkbox options yet.</div>
                    )}
                  </div>
                ) : null}

                {question.type !== "subdropdown" && option.followUp === "subdropdown" ? (
                  <div className="nestedWrap">
                    <div className="row">
                      <div className="selectCell">
                        <label>Sub Dropdown Mode</label>
                        <select
                          value={option.subRequired ? "required" : "optional"}
                          onChange={(event) => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              subRequired: event.target.value === "required",
                            };
                            onChange({ ...question, options });
                          }}
                        >
                          <option value="optional">Sub Optional</option>
                          <option value="required">Sub Required</option>
                        </select>
                      </div>
                    </div>

                    <div className="muted">Sub-dropdown options (user will select one):</div>

                    <div className="row">
                      <div className="grow">
                        <label>Add Sub-option</label>
                        <input
                          id={`${optionInputId}_${option.id}_subdropdown`}
                          type="text"
                          placeholder="e.g., Diploma / UG / PG"
                        />
                      </div>
                      <div className="buttonCell">
                        <label>&nbsp;</label>
                        <button
                          className="primaryButton"
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(
                              `${optionInputId}_${option.id}_subdropdown`,
                            ) as HTMLInputElement | null;
                            const value = input?.value.trim() || "";
                            if (!value) return;

                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              subOptions: [...option.subOptions, { text: value }],
                            };
                            onChange({ ...question, options });

                            if (input) input.value = "";
                          }}
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {option.subOptions.length ? (
                      option.subOptions.map((subOption, subOptionIndex) => (
                        <div className="optionRow" key={`${option.id}_subdropdown_${subOptionIndex}`}>
                          <input
                            type="text"
                            value={subOption.text}
                            onChange={(event) => {
                              const options = [...question.options];
                              const subOptions = [...option.subOptions];
                              subOptions[subOptionIndex] = { text: event.target.value };
                              options[optionIndex] = { ...option, subOptions };
                              onChange({ ...question, options });
                            }}
                          />
                          <div className="optionTools">
                            <button
                              className="dangerButton smallButton"
                              type="button"
                              onClick={() => {
                                const options = [...question.options];
                                options[optionIndex] = {
                                  ...option,
                                  subOptions: option.subOptions.filter(
                                    (_, index) => index !== subOptionIndex,
                                  ),
                                };
                                onChange({ ...question, options });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="muted">No sub-dropdown options yet.</div>
                    )}
                  </div>
                ) : null}

                {question.type === "subdropdown" ? (
                  <div className="nestedWrap">
                    <div className="categorySectionHead">
                      <div>
                        <div className="pill">{option.text || "Option"}</div>
                        <div className="muted questionHint">Child questions under this option</div>
                      </div>
                      <div className="selectCell">
                        <label>Add Child Question Type</label>
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const value = event.target.value as QuestionType | "";
                            if (!value) return;
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              childQuestions: [...option.childQuestions, blankQuestion(value, true)],
                            };
                            onChange({ ...question, options });
                            event.target.value = "";
                          }}
                        >
                          <option value="">Choose...</option>
                          <option value="text">Text</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="subdropdown">Sub dropdown</option>
                        </select>
                      </div>
                    </div>

                    {option.childQuestions.length ? (
                      option.childQuestions.map((childQuestion, childIndex) => (
                        <QuestionEditor
                          key={childQuestion.id}
                          question={childQuestion}
                          depth={depth + 1}
                          optionInputId={`${optionInputId}_${option.id}_${childQuestion.id}`}
                          onChange={(nextChild) => {
                            const options = [...question.options];
                            const childQuestions = [...option.childQuestions];
                            childQuestions[childIndex] = nextChild;
                            options[optionIndex] = { ...option, childQuestions };
                            onChange({ ...question, options });
                          }}
                          onDelete={() => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              childQuestions: option.childQuestions.filter((_, index) => index != childIndex),
                            };
                            onChange({ ...question, options });
                          }}
                          onMoveUp={() => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              childQuestions: moveItem(option.childQuestions, childIndex, -1),
                            };
                            onChange({ ...question, options });
                          }}
                          onMoveDown={() => {
                            const options = [...question.options];
                            options[optionIndex] = {
                              ...option,
                              childQuestions: moveItem(option.childQuestions, childIndex, 1),
                            };
                            onChange({ ...question, options });
                          }}
                        />
                      ))
                    ) : (
                      <div className="muted">No child questions yet.</div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="muted">No options yet.</div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function AdminBuilderPage() {
  const [state, setState] = useState<FormState>(defaultState());
  const [sectionName, setSectionName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeMainOptionId, setActiveMainOptionId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiLoad()
      .then((data) => {
        if (!active) return;
        const nextState = data.mainSectionInputType === "dropdown" ? syncDropdownSections(data) : data;
        setState(nextState);
        setActiveCategoryId(GENERAL_SCOPE_ID);
        setActiveMainOptionId(nextState.mainSectionOptions[0]?.id || "");
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setState(defaultState());
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeCategoryId === GENERAL_SCOPE_ID) {
      return;
    }

    const exists = state.categories.some((category) => category.id === activeCategoryId);
    if (!exists) {
      setActiveCategoryId(GENERAL_SCOPE_ID);
    }
  }, [activeCategoryId, state.categories]);

  useEffect(() => {
    const activeCategory = state.categories.find((category) => category.id === activeCategoryId);
    const inputType = activeCategoryId === GENERAL_SCOPE_ID ? state.mainSectionInputType : (activeCategory?.mainSectionInputType || "checkbox");
    const options = activeCategoryId === GENERAL_SCOPE_ID ? state.mainSectionOptions : (activeCategory?.mainSectionOptions || []);

    if (inputType !== "dropdown") {
      if (activeMainOptionId) setActiveMainOptionId("");
      return;
    }

    const exists = options.some((option) => option.id === activeMainOptionId);
    if (!exists) {
      setActiveMainOptionId(options[0]?.id || "");
    }
  }, [activeCategoryId, activeMainOptionId, state.categories, state.mainSectionInputType, state.mainSectionOptions]);

  function patch(mutator: (next: FormState) => void) {
    setState((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next.mainSectionInputType === "dropdown" ? syncDropdownSections(next) : next;
    });
  }

  function getBucket(next: FormState, sectionIndex: number, categoryId: string) {
    return next.sections[sectionIndex].categoryQuestions.find((group) => group.categoryId === categoryId);
  }

  function getQuestionList(next: FormState, sectionIndex: number, scopeId: string) {
    if (scopeId === GENERAL_SCOPE_ID) {
      return next.sections[sectionIndex].generalQuestions;
    }

    return getBucket(next, sectionIndex, scopeId)?.questions ?? [];
  }

  if (loading) {
    return <main className="shell"><section className="card"><div className="cardBody"><p className="muted">Loading builder...</p></div></section></main>;
  }

  const activeCategory = state.categories.find((category) => category.id === activeCategoryId);
  const activeScopeLabel = activeCategoryId === GENERAL_SCOPE_ID ? "General" : (activeCategory?.name || "No category");
  const isGeneralScope = activeCategoryId === GENERAL_SCOPE_ID;
  const currentMainSectionTitle = isGeneralScope ? state.mainSectionTitle : (activeCategory?.mainSectionTitle || "Main Section");
  const currentMainSectionInputType = isGeneralScope ? state.mainSectionInputType : (activeCategory?.mainSectionInputType || "checkbox");
  const currentMainSectionOptions = isGeneralScope ? state.mainSectionOptions : (activeCategory?.mainSectionOptions || []);
  const visibleSections = !isGeneralScope
    ? state.sections.reduce<Array<{ section: NonNullable<FormState["sections"][number]>; sectionIndex: number; lockedToMainOption: boolean }>>((items, section, sectionIndex) => {
        if (section.categoryOwnerId !== activeCategoryId) return items;
        if (currentMainSectionInputType === "dropdown") {
          if (section.mainOptionId !== activeMainOptionId) return items;
        } else if (section.mainOptionId) {
          return items;
        }
        items.push({ section, sectionIndex, lockedToMainOption: false });
        return items;
      }, [])
    : currentMainSectionInputType === "dropdown"
      ? state.sections.reduce<Array<{ section: NonNullable<FormState["sections"][number]>; sectionIndex: number; lockedToMainOption: boolean }>>((items, section, sectionIndex) => {
          if (section.mainOptionId !== activeMainOptionId || section.categoryOwnerId) return items;
          items.push({ section, sectionIndex, lockedToMainOption: false });
          return items;
        }, [])
      : state.sections.filter((section) => !section.mainOptionId && !section.categoryOwnerId).map((section, sectionIndex) => ({ section, sectionIndex, lockedToMainOption: false }));

  return (
    <>
      <header className="topbar">
        <h1>Admin Builder</h1>
        <div className="topbarActions">
          <a className="ghostLink" href="/" target="_blank" rel="noreferrer">Open User Page</a>
          <button className="primaryButton" type="button" onClick={() => apiSave(state).then(() => window.alert("Saved Live! Everyone will see these questions.")).catch((error) => window.alert(error instanceof Error ? error.message : "Save failed"))}>Save Live</button>
        </div>
      </header>

      <main className="shell">
        <section className="card">
          <div className="cardHeader">
            <h2>Manage Categories</h2>
            <span className="muted">Click a category to edit that category's questions.</span>
          </div>
          <div className="cardBody">
            <div className="row">
              <div className="grow">
                <label>Add Category</label>
                <input type="text" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
              </div>
              <div className="buttonCell">
                <label>&nbsp;</label>
                <button className="primaryButton" type="button" onClick={() => {
                  const name = categoryName.trim();
                  if (!name) return;
                  const categoryId = uid();
                  patch((next) => {
                    next.categories.push(defaultCategoryState(name, categoryId));
                    next.sections.forEach((section) => {
                      section.categoryQuestions.push({ categoryId, title: section.title || section.generalTitle || "", questions: [] });
                    });
                  });
                  setActiveCategoryId(categoryId);
                  setCategoryName("");
                }}>+ Add Category</button>
              </div>
            </div>

            <div className="divider" />
            {state.categories.length ? state.categories.map((category, categoryIndex) => (
              <div className={`categoryRow${activeCategoryId === category.id ? " activeCategoryRow" : ""}`} key={category.id}>
                <button className={`categoryTabButton${activeCategoryId === category.id ? " active" : ""}`} type="button" onClick={() => setActiveCategoryId(category.id)}>{category.name || "Untitled Category"}</button>
                <input type="text" value={category.name} onChange={(event) => patch((next) => { next.categories[categoryIndex].name = event.target.value; })} />
                <div className="sectionActions">
                  <button className="smallButton" type="button" onClick={() => {
                    const duplicateId = uid();
                    patch((next) => {
                      const sourceCategory = next.categories[categoryIndex];
                      next.categories.splice(categoryIndex + 1, 0, { ...structuredClone(sourceCategory), id: duplicateId, name: `${sourceCategory.name} Copy`, mainSectionOptions: structuredClone(sourceCategory.mainSectionOptions) });
                      next.sections.forEach((section) => {
                        const sourceGroup = section.categoryQuestions.find((group) => group.categoryId === sourceCategory.id);
                        section.categoryQuestions.push({ categoryId: duplicateId, title: sourceGroup?.title || section.title || section.generalTitle || "", questions: cloneQuestions(sourceGroup?.questions ?? []) });
                      });
                    });
                    setActiveCategoryId(duplicateId);
                  }}>Duplicate</button>
                  <button className="dangerButton smallButton" type="button" onClick={() => {
                    const removeId = category.id;
                    patch((next) => {
                      next.categories = next.categories.filter((item) => item.id != removeId);
                      next.sections = next.sections.filter((section) => section.categoryOwnerId !== removeId);
                      next.sections.forEach((section) => {
                        section.categoryQuestions = section.categoryQuestions.filter((group) => group.categoryId != removeId);
                      });
                    });
                    if (activeCategoryId === removeId) {
                      setActiveCategoryId(state.categories[categoryIndex + 1]?.id || state.categories[categoryIndex - 1]?.id || "");
                    }
                  }}>Remove</button>
                </div>
              </div>
            )) : <div className="muted">No categories yet.</div>}
          </div>
        </section>

        <section className="card">
          <div className="cardHeader">
            <h2>Build Sections & Questions</h2>
            <span className="muted">Includes Text, Dropdown, Checkbox, and Sub dropdown.</span>
          </div>
          <div className="cardBody">
            {isGeneralScope ? (
              <>
                <div className="row">
                  <div className="grow">
                    <label>Main Section Title</label>
                    <input
                      type="text"
                      value={currentMainSectionTitle}
                      onChange={(event) =>
                        patch((next) => {
                          if (isGeneralScope) { next.mainSectionTitle = event.target.value; } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionTitle = event.target.value; }
                        })
                      }
                    />
                  </div>
                  <div className="selectCell">
                    <label>Main Section Input</label>
                    <select
                      value={currentMainSectionInputType}
                      onChange={(event) =>
                        patch((next) => {
                          const nextType = event.target.value === "dropdown" ? "dropdown" : "checkbox"; if (isGeneralScope) { next.mainSectionInputType = nextType; } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionInputType = nextType; }
                        })
                      }
                    >
                      <option value="checkbox">Checkbox</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                  </div>
                </div>

                {currentMainSectionInputType === "dropdown" ? (
                  <>
                    <div className="divider" />
                    <div className="row">
                      <div className="grow">
                        <label>Add Main Section Dropdown Value</label>
                        <input id="main-section-option-input" type="text" placeholder="e.g., Sales Call" />
                      </div>
                      <div className="buttonCell">
                        <label>&nbsp;</label>
                        <button className="primaryButton" type="button" onClick={() => {
                          const input = document.getElementById("main-section-option-input") as HTMLInputElement | null;
                          const value = input?.value.trim() || "";
                          if (!value) return;
                          patch((next) => {
                            if (isGeneralScope) { next.mainSectionOptions.push({ id: uid(), title: value }); } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionOptions.push({ id: uid(), title: value }); }
                          });
                          if (input) input.value = "";
                        }}>+ Add Value</button>
                      </div>
                    </div>
                    <div className="divider" />
                    {currentMainSectionOptions.length ? currentMainSectionOptions.map((option, optionIndex) => (
                      <div className="optionRow" key={option.id}>
                        <input
                          type="text"
                          value={option.title}
                          onChange={(event) => patch((next) => { if (isGeneralScope) { next.mainSectionOptions[optionIndex].title = event.target.value; } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionOptions[optionIndex].title = event.target.value; } })}
                        />
                        <div className="optionTools">
                          <button className="smallButton" type="button" onClick={() => patch((next) => { if (isGeneralScope) { next.mainSectionOptions = moveStringItem(next.mainSectionOptions, optionIndex, -1); } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionOptions = moveStringItem(category.mainSectionOptions, optionIndex, -1); } })}>Up</button>
                          <button className="smallButton" type="button" onClick={() => patch((next) => { if (isGeneralScope) { next.mainSectionOptions = moveStringItem(next.mainSectionOptions, optionIndex, 1); } else { const category = next.categories.find((item) => item.id === activeCategoryId); if (category) category.mainSectionOptions = moveStringItem(category.mainSectionOptions, optionIndex, 1); } })}>Down</button>
                          <button className="dangerButton smallButton" type="button" onClick={() => patch((next) => { const category = !isGeneralScope ? next.categories.find((item) => item.id === activeCategoryId) : undefined; const removeId = isGeneralScope ? next.mainSectionOptions[optionIndex].id : (category?.mainSectionOptions[optionIndex]?.id || ""); if (!removeId) return; if (isGeneralScope) { next.mainSectionOptions = next.mainSectionOptions.filter((entry) => entry.id !== removeId); } else if (category) { category.mainSectionOptions = category.mainSectionOptions.filter((entry) => entry.id !== removeId); } next.sections = next.sections.filter((section) => section.mainOptionId !== removeId); })}>Remove</button>
                        </div>
                      </div>
                    )) : <div className="muted">No dropdown values yet.</div>}
                    {currentMainSectionOptions.length ? <><div className="divider" /><div className="categoryTabs">{currentMainSectionOptions.map((option) => <button key={option.id} className={`categoryTabButton${activeMainOptionId === option.id ? " active" : ""}`} type="button" onClick={() => setActiveMainOptionId(option.id)}>{option.title || "Untitled Value"}</button>)}</div></> : null}
                    <div className="divider" />
                  </>
                ) : (
                  <div className="divider" />
                )}
              </>
            ) : null}

            <div className="row">
              <div className="grow">
                <label>{!isGeneralScope ? (currentMainSectionInputType === "dropdown" ? "Add Sub Section" : "Add Section") : currentMainSectionInputType === "dropdown" ? "Add Sub Section" : "Add Section"}</label>
                <input type="text" value={sectionName} onChange={(event) => setSectionName(event.target.value)} />
              </div>
              <div className="buttonCell">
                <label>&nbsp;</label>
                <button className="primaryButton" type="button" onClick={() => {
                  const title = sectionName.trim();
                  if (!title) return;
                  if (currentMainSectionInputType === "dropdown" && !activeMainOptionId) return;
                  patch((next) => {
                    next.sections.push(createSection(
                      title,
                      next,
                      currentMainSectionInputType === "dropdown" ? activeMainOptionId : undefined,
                      !isGeneralScope ? activeCategoryId : undefined,
                    ));
                  });
                  setSectionName("");
                }}>{currentMainSectionInputType === "dropdown" ? "+ Add Sub Section" : "+ Add Section"}</button>
              </div>
            </div>

            <div className="divider" />

            <div className="categoryTabs"><button className={`categoryTabButton${activeCategoryId === GENERAL_SCOPE_ID ? " active" : ""}`} type="button" onClick={() => setActiveCategoryId(GENERAL_SCOPE_ID)}>General</button>{state.categories.map((category) => <button key={category.id} className={`categoryTabButton${activeCategoryId === category.id ? " active" : ""}`} type="button" onClick={() => setActiveCategoryId(category.id)}>{category.name}</button>)}</div>

            <div className="divider" />

            {visibleSections.length ? visibleSections.map(({ section, sectionIndex, lockedToMainOption }) => {
              const questions = getQuestionList(state, sectionIndex, activeCategoryId);
              return (
                <div className="sectionCard" key={section.id}>
                  <div className="sectionHead">
                    <div className="sectionHeadLeft">
                      <div className="sectionTitle">{activeCategoryId === GENERAL_SCOPE_ID ? (section.generalTitle || section.title || "Untitled Section") : (getBucket(state, sectionIndex, activeCategoryId)?.title || section.title || section.generalTitle || "Untitled Section")}</div>
                      <div className="badge">{activeScopeLabel}</div>
                    </div>
                    <div className="sectionActions">
                      {lockedToMainOption ? null : <><button className="smallButton" type="button" onClick={() => patch((next) => { next.sections = moveItem(next.sections, sectionIndex, -1); })}>Up</button><button className="smallButton" type="button" onClick={() => patch((next) => { next.sections = moveItem(next.sections, sectionIndex, 1); })}>Down</button><button className="dangerButton smallButton" type="button" onClick={() => patch((next) => { next.sections.splice(sectionIndex, 1); })}>Delete</button></>}
                    </div>
                  </div>
                  <div className="sectionBody">
                    <div className="row">
                      <div className="grow">
                        <label>Section Title</label>
                        <input type="text" value={activeCategoryId === GENERAL_SCOPE_ID ? (section.generalTitle || section.title) : (getBucket(state, sectionIndex, activeCategoryId)?.title || section.title || section.generalTitle)} onChange={(event) => patch((next) => { if (activeCategoryId === GENERAL_SCOPE_ID) { next.sections[sectionIndex].generalTitle = event.target.value; next.sections[sectionIndex].title = event.target.value; } else { const bucket = getBucket(next, sectionIndex, activeCategoryId); if (bucket) bucket.title = event.target.value; } })} />
                      </div>
                      <div className="selectCell"><label>Add Question Type</label><select defaultValue="" onChange={(event) => {
                        const value = event.target.value as QuestionType | "";
                        if (!value) return;
                        patch((next) => {
                          getQuestionList(next, sectionIndex, activeCategoryId).push(blankQuestion(value, value === "subdropdown"));
                        });
                        event.target.value = "";
                      }}><option value="">Choose...</option><option value="text">Text</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="subdropdown">Sub dropdown</option></select></div>
                    </div>

                    <div className="divider" />

                    {questions.length ? questions.map((question, questionIndex) => <QuestionEditor key={question.id} question={question} optionInputId={`opt_${section.id}_${question.id}`} onChange={(nextQuestion) => patch((next) => { if (activeCategoryId === GENERAL_SCOPE_ID) { next.sections[sectionIndex].generalQuestions[questionIndex] = nextQuestion; } else { const bucket = getBucket(next, sectionIndex, activeCategoryId); if (bucket) bucket.questions[questionIndex] = nextQuestion; } })} onDelete={() => patch((next) => { if (activeCategoryId === GENERAL_SCOPE_ID) { next.sections[sectionIndex].generalQuestions.splice(questionIndex, 1); } else { getBucket(next, sectionIndex, activeCategoryId)?.questions.splice(questionIndex, 1); } })} onMoveUp={() => patch((next) => { if (activeCategoryId === GENERAL_SCOPE_ID) { next.sections[sectionIndex].generalQuestions = moveItem(next.sections[sectionIndex].generalQuestions, questionIndex, -1); } else { const bucket = getBucket(next, sectionIndex, activeCategoryId); if (bucket) bucket.questions = moveItem(bucket.questions, questionIndex, -1); } })} onMoveDown={() => patch((next) => { if (activeCategoryId === GENERAL_SCOPE_ID) { next.sections[sectionIndex].generalQuestions = moveItem(next.sections[sectionIndex].generalQuestions, questionIndex, 1); } else { const bucket = getBucket(next, sectionIndex, activeCategoryId); if (bucket) bucket.questions = moveItem(bucket.questions, questionIndex, 1); } })} />) : <div className="muted">No questions in this scope for this section.</div>}
                  </div>
                </div>
              );
            }) : <div className="muted">{currentMainSectionInputType === "dropdown" ? "Add a main section dropdown value above to create question groups." : "No sections yet. Add a section above."}</div>}
          </div>
        </section>
      </main>
    </>
  );
}
