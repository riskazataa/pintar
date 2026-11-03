export interface BAExcelRow {
  answer: any
  no: string
  child: boolean
}

export function buildBAExcelRows(answers: any[]): BAExcelRow[] {
  const parents = answers.filter((answer) => !answer.question?.parent_id)
  const rows: BAExcelRow[] = []
  let sectionNumber = 0

  for (const parent of parents) {
    const children = answers.filter((answer) => answer.question?.parent_id === parent.question_id)
    if (parent.question?.is_header) {
      sectionNumber = 0
      rows.push({ answer: parent, no: '', child: false })
      children.forEach((answer, index) => {
        const no = String(index + 1)
        sectionNumber = index + 1
        rows.push({ answer, no, child: true })
      })
      continue
    }

    sectionNumber += 1
    rows.push({ answer: parent, no: String(sectionNumber), child: false })
    children.forEach((answer, index) => {
      rows.push({
        answer,
        no: `${sectionNumber}.${String.fromCharCode(97 + index)}`,
        child: true,
      })
    })
  }

  return rows
}
