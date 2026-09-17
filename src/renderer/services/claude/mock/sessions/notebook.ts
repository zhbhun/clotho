import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

const NOTEBOOK_PATH = '/Users/zhanghuabin/Projects/zhbhun/demo/analysis.ipynb'

const initialFile = `{
  "cells": [
    {
      "cell_type": "code",
      "execution_count": null,
      "metadata": {},
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": [
            "hello\\n"
          ]
        }
      ],
      "source": [
        "print(\\"hello\\")\\n"
      ]
    },
    {
      "cell_type": "markdown",
      "metadata": {},
      "source": [
        "# Demo Notebook\\n",
        "\\n",
        "This notebook is used to test NotebookEdit.\\n"
      ]
    }
  ],
  "metadata": {
    "kernelspec": {
      "display_name": "Python 3",
      "language": "python",
      "name": "python3"
    },
    "language_info": {
      "name": "python",
      "version": "3.11.0"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 5
}`

const afterReplaceFile = `{
 "cells": [
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": "print(\\"updated by NotebookEdit\\")"
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# Demo Notebook\\n",
    "\\n",
    "This notebook is used to test NotebookEdit.\\n"
   ]
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "name": "python",
   "version": "3.11.0"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 5
}`

const afterInsertFile = `{
 "cells": [
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": "print(\\"updated by NotebookEdit\\")"
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# Demo Notebook\\n",
    "\\n",
    "This notebook is used to test NotebookEdit.\\n"
   ]
  },
  {
   "cell_type": "code",
   "id": "0941c519",
   "source": "import datetime\\nprint(datetime.datetime.now())",
   "metadata": {},
   "execution_count": null,
   "outputs": []
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "name": "python",
   "version": "3.11.0"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 5
}`

export function notebookLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText(
      `Demonstrate three NotebookEdit operations: read ${NOTEBOOK_PATH}, replace the first code cell, insert a new cell after the markdown cell, then delete the inserted cell.`,
      { ts: t0 },
    ),
  )

  lines.push(
    assistantText(`Sure, use Read to load the notebook and get each cell ID first.`, { ts: t0 }),
  )

  const readId = callId()
  lines.push(
    ...toolCallPair(
      'Read',
      { file_path: NOTEBOOK_PATH },
      `<cell id="cell-0">print("hello")\n</cell id="cell-0">\n\nhello\n\n<cell id="cell-1"><cell_type>markdown</cell_type># Demo Notebook\n\nThis notebook is used to test NotebookEdit.\n</cell id="cell-1">`,
      {
        id: readId,
        ts: t0,
        toolUseResult: {
          type: 'notebook',
          file: {
            filePath: NOTEBOOK_PATH,
            cells: [
              {
                cellType: 'code',
                source: 'print("hello")\n',
                cell_id: 'cell-0',
                language: 'python',
                outputs: [{ output_type: 'stream', text: 'hello\n' }],
              },
              {
                cellType: 'markdown',
                source: '# Demo Notebook\n\nThis notebook is used to test NotebookEdit.\n',
                cell_id: 'cell-1',
              },
            ],
          },
        },
      },
    ),
  )

  lines.push(
    assistantText(`Loaded cell-0 (code) and cell-1 (markdown). Now replace cell-0 content.`, {
      ts: t1,
    }),
  )

  const replaceId = callId()
  lines.push(
    ...toolCallPair(
      'NotebookEdit',
      {
        notebook_path: NOTEBOOK_PATH,
        cell_id: 'cell-0',
        edit_mode: 'replace',
        new_source: 'print("updated by NotebookEdit")',
      },
      `Updated cell cell-0 with print("updated by NotebookEdit")`,
      {
        id: replaceId,
        ts: t1,
        toolUseResult: {
          new_source: 'print("updated by NotebookEdit")',
          old_source: 'print("hello")\n',
          cell_type: 'code',
          language: 'python',
          edit_mode: 'replace',
          cell_id: 'cell-0',
          error: '',
          notebook_path: NOTEBOOK_PATH,
          original_file: initialFile,
          updated_file: afterReplaceFile,
        },
      },
    ),
  )

  lines.push(
    assistantText(`cell-0 is updated. Next, insert a new code cell after cell-1.`, {
      ts: t2,
    }),
  )

  const insertId = callId()
  lines.push(
    ...toolCallPair(
      'NotebookEdit',
      {
        notebook_path: NOTEBOOK_PATH,
        cell_id: 'cell-1',
        cell_type: 'code',
        edit_mode: 'insert',
        new_source: 'import datetime\nprint(datetime.datetime.now())',
      },
      `Inserted cell 0941c519 with import datetime\nprint(datetime.datetime.now())`,
      {
        id: insertId,
        ts: t2,
        toolUseResult: {
          new_source: 'import datetime\nprint(datetime.datetime.now())',
          cell_type: 'code',
          language: 'python',
          edit_mode: 'insert',
          cell_id: '0941c519',
          error: '',
          notebook_path: NOTEBOOK_PATH,
          original_file: afterReplaceFile,
          updated_file: afterInsertFile,
        },
      },
    ),
  )

  lines.push(assistantText(`New cell 0941c519 is inserted. Finally, delete it.`, { ts: t2 }))

  const deleteId = callId()
  lines.push(
    ...toolCallPair(
      'NotebookEdit',
      {
        notebook_path: NOTEBOOK_PATH,
        cell_id: '0941c519',
        edit_mode: 'delete',
        new_source: '',
      },
      `Deleted cell 0941c519`,
      {
        id: deleteId,
        ts: t2,
        toolUseResult: {
          new_source: '',
          old_source: 'import datetime\nprint(datetime.datetime.now())',
          cell_type: 'code',
          language: 'python',
          edit_mode: 'delete',
          cell_id: '0941c519',
          error: '',
          notebook_path: NOTEBOOK_PATH,
          original_file: afterInsertFile,
          updated_file: afterReplaceFile,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      `Three steps complete: replace updated cell-0, insert added 0941c519, and delete removed it. The notebook is back to two cells.`,
      { ts: t2 },
    ),
  )

  return lines
}
