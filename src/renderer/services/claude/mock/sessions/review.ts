import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function reviewLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 1)
  const t1 = ts(0, 0)

  lines.push(
    userText('Review src/auth/handler.ts and submit findings with ReportFindings.', { ts: t0 }),
  )

  lines.push(
    assistantText(
      'Review complete. I found 4 issues and will submit them from highest to lowest severity. The most serious is SQL injection on line 42 (high); the rest concern efficiency, correctness, and code quality.',
      { ts: t0 },
    ),
  )

  const reportId = callId()
  lines.push(
    ...toolCallPair(
      'ReportFindings',
      {
        level: 'high',
        findings: [
          {
            file: 'src/auth/handler.ts',
            line: 42,
            summary:
              'buildQuery constructs SQL by string concatenation; user_id is not parameterized and allows SQL injection',
            failure_scenario:
              'When an attacker sends user_id = "1 OR 1=1", the query becomes SELECT * FROM users WHERE id = 1 OR 1=1 and returns every row. Use a parameterized query such as db.query("SELECT * FROM users WHERE id = ?", [user_id]).',
            category: 'security',
          },
          {
            file: 'src/auth/handler.ts',
            line: 78,
            summary:
              'validateToken runs a regex for every character in a loop; long tokens can amplify O(n×m)',
            failure_scenario:
              'A 100KB token can trigger regex backtracking, causing high CPU and request timeouts. Precompile the regex and cap input length early.',
            category: 'efficiency',
          },
          {
            file: 'src/auth/handler.ts',
            line: 15,
            summary:
              'TOKEN_SECRET is read from a hardcoded constant and has no environment-variable override',
            failure_scenario:
              'In production TOKEN_SECRET remains "dev-secret", allowing anyone to forge JWTs. Read process.env.TOKEN_SECRET and require it at startup.',
            category: 'correctness',
          },
          {
            file: 'src/auth/handler.ts',
            line: 5,
            summary: 'The crypto import is unused; validateToken actually uses jsonwebtoken',
            failure_scenario:
              'No direct runtime impact, but it misleads maintainers into expecting crypto logic. Remove the import.',
            category: 'simplification',
          },
        ],
      },
      '4 findings reported.',
      {
        id: reportId,
        ts: t0,
        toolUseResult: {
          count: 4,
          level: 'high',
          findings: [
            {
              file: 'src/auth/handler.ts',
              line: 42,
              summary:
                'buildQuery constructs SQL by string concatenation; user_id is not parameterized and allows SQL injection',
              failure_scenario:
                'When an attacker sends user_id = "1 OR 1=1", the query becomes SELECT * FROM users WHERE id = 1 OR 1=1 and returns every row. Use a parameterized query such as db.query("SELECT * FROM users WHERE id = ?", [user_id]).',
              category: 'security',
            },
            {
              file: 'src/auth/handler.ts',
              line: 78,
              summary:
                'validateToken runs a regex for every character in a loop; long tokens can amplify O(n×m)',
              failure_scenario:
                'A 100KB token can trigger regex backtracking, causing high CPU and request timeouts. Precompile the regex and cap input length early.',
              category: 'efficiency',
            },
            {
              file: 'src/auth/handler.ts',
              line: 15,
              summary:
                'TOKEN_SECRET is read from a hardcoded constant and has no environment-variable override',
              failure_scenario:
                'In production TOKEN_SECRET remains "dev-secret", allowing anyone to forge JWTs. Read process.env.TOKEN_SECRET and require it at startup.',
              category: 'correctness',
            },
            {
              file: 'src/auth/handler.ts',
              line: 5,
              summary: 'The crypto import is unused; validateToken actually uses jsonwebtoken',
              failure_scenario:
                'No direct runtime impact, but it misleads maintainers into expecting crypto logic. Remove the import.',
              category: 'simplification',
            },
          ],
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Fixes applied: parameterize the SQL query, read TOKEN_SECRET from the environment, remove the dead import, and precompile the validateToken regex. Submit the report again with an outcome for each finding.',
      { ts: t1 },
    ),
  )

  const reReportId = callId()
  lines.push(
    ...toolCallPair(
      'ReportFindings',
      {
        level: 'low',
        findings: [
          {
            file: 'src/auth/handler.ts',
            line: 42,
            summary:
              'buildQuery constructs SQL by string concatenation; user_id is not parameterized and allows SQL injection',
            failure_scenario:
              'An attacker can send user_id = "1 OR 1=1" to return every row. Use a parameterized query.',
            category: 'security',
            outcome: 'fixed — changed to db.query("SELECT * FROM users WHERE id = ?", [user_id])',
          },
          {
            file: 'src/auth/handler.ts',
            line: 78,
            summary: 'validateToken runs a regex in a loop; long tokens can amplify O(n×m)',
            failure_scenario: 'An oversized token can drive CPU usage high. Precompile the regex.',
            category: 'efficiency',
            outcome: 'fixed — regex moved to a module-level constant and input capped at 4KB',
          },
          {
            file: 'src/auth/handler.ts',
            line: 15,
            summary: 'TOKEN_SECRET is read from a hardcoded constant',
            failure_scenario: 'Production still uses the development value "dev-secret".',
            category: 'correctness',
            outcome: 'fixed — switched to process.env.TOKEN_SECRET with a non-empty startup check',
          },
          {
            file: 'src/auth/handler.ts',
            line: 5,
            summary: 'The crypto import is unused',
            failure_scenario: 'It misleads maintainers.',
            category: 'simplification',
            outcome: 'fixed — removed',
          },
        ],
      },
      '4 findings reported.',
      {
        id: reReportId,
        ts: t1,
        toolUseResult: {
          count: 4,
          level: 'low',
          findings: [
            {
              file: 'src/auth/handler.ts',
              line: 42,
              summary:
                'buildQuery constructs SQL by string concatenation; user_id is not parameterized and allows SQL injection',
              failure_scenario:
                'An attacker can send user_id = "1 OR 1=1" to return every row. Use a parameterized query.',
              category: 'security',
              outcome: 'fixed — changed to db.query("SELECT * FROM users WHERE id = ?", [user_id])',
            },
            {
              file: 'src/auth/handler.ts',
              line: 78,
              summary: 'validateToken runs a regex in a loop; long tokens can amplify O(n×m)',
              failure_scenario:
                'An oversized token can drive CPU usage high. Precompile the regex.',
              category: 'efficiency',
              outcome: 'fixed — regex moved to a module-level constant and input capped at 4KB',
            },
            {
              file: 'src/auth/handler.ts',
              line: 15,
              summary: 'TOKEN_SECRET is read from a hardcoded constant',
              failure_scenario: 'Production still uses the development value "dev-secret".',
              category: 'correctness',
              outcome:
                'fixed — switched to process.env.TOKEN_SECRET with a non-empty startup check',
            },
            {
              file: 'src/auth/handler.ts',
              line: 5,
              summary: 'The crypto import is unused',
              failure_scenario: 'It misleads maintainers.',
              category: 'simplification',
              outcome: 'fixed — removed',
            },
          ],
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'All 4 issues were fixed and reported again, lowering the level from high to low. SQL injection (security) was the most serious finding; parameterization fully blocks the injection path.',
      { ts: t1 },
    ),
  )

  return lines
}
