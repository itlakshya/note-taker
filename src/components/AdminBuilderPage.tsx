"use client";

import { useEffect, useState } from "react";
import {
  defaultState,
  smartDefaultFollowUp,
  type FollowUpType,
  type FormState,
  type Option,
  type Question,
  type QuestionType,
} from "@/lib/form-state";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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
  };
}

function blankOption(text: string): Option {
  return {
    id: uid(),
    text,
    followUp: smartDefaultFollowUp(text) as FollowUpType,
    followRequired: false,
    subRequired: false,
    subOptions: [],
    childQuestions: [],
  };
}

async function apiLoad() {
  const response = await fetch("/api/form", { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as FormState;
  if (!data || !Array.isArray(data.sections)) return defaultState();
  return data;
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
            <div className="buttonCell">
              <label>&nbsp;</label>
              <button
                className="primaryButton"
                type="button"
                onClick={() => {
                  const input = document.getElementById(optionInputId) as HTMLInputElement | null;
                  const value = input?.value.trim() || "";
                  if (!value) return;
                  onChange({ ...question, options: [...question.options, blankOption(value)] });
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
                      </select>
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiLoad()
      .then((data) => {
        if (!active) return;
        setState(data);
        setActiveCategoryId(data.categories[0]?.id || "");
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
    if (!state.categories.length) {
      if (activeCategoryId) setActiveCategoryId("");
      return;
    }

    const exists = state.categories.some((category) => category.id === activeCategoryId);
    if (!exists) {
      setActiveCategoryId(state.categories[0].id);
    }
  }, [activeCategoryId, state.categories]);

  function patch(mutator: (next: FormState) => void) {
    setState((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  function getBucket(next: FormState, sectionIndex: number, categoryId: string) {
    return next.sections[sectionIndex].categoryQuestions.find((group) => group.categoryId === categoryId);
  }

  if (loading) {
    return <main className="shell"><section className="card"><div className="cardBody"><p className="muted">Loading builder...</p></div></section></main>;
  }

  const activeCategory = state.categories.find((category) => category.id === activeCategoryId);

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
                    next.categories.push({ id: categoryId, name });
                    next.sections.forEach((section) => {
                      section.categoryQuestions.push({ categoryId, questions: [] });
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
                      next.categories.splice(categoryIndex + 1, 0, { id: duplicateId, name: `${sourceCategory.name} Copy` });
                      next.sections.forEach((section) => {
                        const sourceGroup = section.categoryQuestions.find((group) => group.categoryId === sourceCategory.id);
                        section.categoryQuestions.push({ categoryId: duplicateId, questions: cloneQuestions(sourceGroup?.questions ?? []) });
                      });
                    });
                    setActiveCategoryId(duplicateId);
                  }}>Duplicate</button>
                  <button className="dangerButton smallButton" type="button" onClick={() => {
                    const removeId = category.id;
                    patch((next) => {
                      next.categories = next.categories.filter((item) => item.id != removeId);
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
            <div className="row">
              <div className="grow">
                <label>Add Section</label>
                <input type="text" value={sectionName} onChange={(event) => setSectionName(event.target.value)} />
              </div>
              <div className="buttonCell">
                <label>&nbsp;</label>
                <button className="primaryButton" type="button" onClick={() => {
                  const title = sectionName.trim();
                  if (!title) return;
                  patch((next) => {
                    next.sections.push({ id: uid(), title, categoryQuestions: next.categories.map((category) => ({ categoryId: category.id, questions: [] })) });
                  });
                  setSectionName("");
                }}>+ Add Section</button>
              </div>
            </div>

            <div className="divider" />

            {activeCategory ? <div className="categoryTabs">{state.categories.map((category) => <button key={category.id} className={`categoryTabButton${activeCategoryId === category.id ? " active" : ""}`} type="button" onClick={() => setActiveCategoryId(category.id)}>{category.name}</button>)}</div> : null}

            <div className="divider" />

            {state.sections.length ? state.sections.map((section, sectionIndex) => {
              const questions = activeCategory ? getBucket(state, sectionIndex, activeCategory.id)?.questions ?? [] : [];
              return (
                <div className="sectionCard" key={section.id}>
                  <div className="sectionHead">
                    <div className="sectionHeadLeft">
                      <div className="sectionTitle">{section.title || "Untitled Section"}</div>
                      <div className="badge">{activeCategory?.name || "No category"}</div>
                    </div>
                    <div className="sectionActions">
                      <button className="smallButton" type="button" onClick={() => patch((next) => { next.sections = moveItem(next.sections, sectionIndex, -1); })}>Up</button>
                      <button className="smallButton" type="button" onClick={() => patch((next) => { next.sections = moveItem(next.sections, sectionIndex, 1); })}>Down</button>
                      <button className="dangerButton smallButton" type="button" onClick={() => patch((next) => { next.sections.splice(sectionIndex, 1); })}>Delete</button>
                    </div>
                  </div>
                  <div className="sectionBody">
                    <div className="row">
                      <div className="grow">
                        <label>Section Title</label>
                        <input type="text" value={section.title} onChange={(event) => patch((next) => { next.sections[sectionIndex].title = event.target.value; })} />
                      </div>
                      {activeCategory ? <div className="selectCell"><label>Add Question Type</label><select defaultValue="" onChange={(event) => {
                        const value = event.target.value as QuestionType | "";
                        if (!value) return;
                        patch((next) => {
                          getBucket(next, sectionIndex, activeCategory.id)?.questions.push(blankQuestion(value, value === "subdropdown"));
                        });
                        event.target.value = "";
                      }}><option value="">Choose...</option><option value="text">Text</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="subdropdown">Sub dropdown</option></select></div> : null}
                    </div>

                    <div className="divider" />

                    {activeCategory ? (questions.length ? questions.map((question, questionIndex) => <QuestionEditor key={question.id} question={question} optionInputId={`opt_${section.id}_${question.id}`} onChange={(nextQuestion) => patch((next) => { const bucket = getBucket(next, sectionIndex, activeCategory.id); if (bucket) bucket.questions[questionIndex] = nextQuestion; })} onDelete={() => patch((next) => { getBucket(next, sectionIndex, activeCategory.id)?.questions.splice(questionIndex, 1); })} onMoveUp={() => patch((next) => { const bucket = getBucket(next, sectionIndex, activeCategory.id); if (bucket) bucket.questions = moveItem(bucket.questions, questionIndex, -1); })} onMoveDown={() => patch((next) => { const bucket = getBucket(next, sectionIndex, activeCategory.id); if (bucket) bucket.questions = moveItem(bucket.questions, questionIndex, 1); })} />) : <div className="muted">No questions for this category in this section.</div>) : <div className="muted">Add a category first.</div>}
                  </div>
                </div>
              );
            }) : <div className="muted">No sections yet. Add a section above.</div>}
          </div>
        </section>
      </main>
    </>
  );
}
