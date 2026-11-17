import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'https://myllm-isx1.onrender.com/api/llm'

const suggestions = [
  {
    title: 'Explain something',
    description: 'Break down a tricky topic in simple terms',
    prompt: 'Explain a tricky concept in simple terms.',
    icon: '✳',
  },
  {
    title: 'Write something',
    description: 'Draft a note, email, or first idea',
    prompt: 'Help me draft a clear, friendly email.',
    icon: '✎',
  },
  {
    title: 'Explore an idea',
    description: 'Brainstorm possibilities and next steps',
    prompt: 'Help me brainstorm ideas for a project.',
    icon: '⌘',
  },
  {
    title: 'Work through code',
    description: 'Understand a bug or plan an implementation',
    prompt: 'Help me debug a coding problem.',
    icon: '</>',
  },
]

function SparkleIcon({ className = '' }) {
  return (
    <svg
      aria-hidden='true'
      className={className}
      fill='none'
      viewBox='0 0 24 24'
    >
      <path
        d='M12 2.75 14.2 9.8l7.05 2.2-7.05 2.2L12 21.25 9.8 14.2l-7.05-2.2L9.8 9.8 12 2.75Z'
        stroke='currentColor'
        strokeLinejoin='round'
        strokeWidth='1.6'
      />
      <path
        d='m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z'
        fill='currentColor'
      />
    </svg>
  )
}

const inlineMarkdownPattern = /(\*\*.+?\*\*|__.+?__|~~.+?~~|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g

function renderInlineMarkdown(text) {
  return text.split(inlineMarkdownPattern).map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <del key={index}>{part.slice(2, -2)}</del>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code className='markdown-inline-code' key={index}>{part.slice(1, -1)}</code>
    }

    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link) {
      return (
        <a href={link[2]} key={index} rel='noreferrer' target='_blank'>
          {link[1]}
        </a>
      )
    }

    return part
  })
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isTableAt(lines, index) {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) {
    return false
  }

  const separatorCells = splitTableRow(lines[index + 1])
  return separatorCells.length > 1 && separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isBlockStart(lines, index) {
  const line = lines[index]
  return (
    /^ {0,3}#{1,6}\s/.test(line) ||
    /^ {0,3}```/.test(line) ||
    /^ {0,3}>/.test(line) ||
    /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(line) ||
    /^ {0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line) ||
    isTableAt(lines, index)
  )
}

function parseMarkdown(content) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^ {0,3}```([\w-]*)/)
    if (fence) {
      const codeLines = []
      index += 1
      while (index < lines.length && !/^ {0,3}```/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1], content: codeLines.join('\n') })
      continue
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] })
      index += 1
      continue
    }

    if (/^ {0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines = []
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^ {0,3}>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }

    if (isTableAt(lines, index)) {
      const headers = splitTableRow(lines[index])
      const separators = splitTableRow(lines[index + 1])
      const rows = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push({
        type: 'table',
        headers,
        alignments: separators.map((cell) => (
          cell.startsWith(':') && cell.endsWith(':')
            ? 'center'
            : cell.endsWith(':')
              ? 'right'
              : 'left'
        )),
        rows,
      })
      continue
    }

    const listItem = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/)
    if (listItem) {
      const ordered = /^\d/.test(listItem[1])
      const items = []
      while (index < lines.length) {
        const nextItem = lines[index].match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/)
        if (!nextItem || /^\d/.test(nextItem[1]) !== ordered) break
        items.push(nextItem[2])
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index])
      index += 1
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(line)
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines })
  }

  return blocks
}

function MarkdownContent({ content }) {
  const blocks = parseMarkdown(content)

  return (
    <div className='markdown-content'>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'heading') {
          const Heading = `h${block.level}`
          return <Heading key={blockIndex}>{renderInlineMarkdown(block.content)}</Heading>
        }

        if (block.type === 'rule') {
          return <hr key={blockIndex} />
        }

        if (block.type === 'code') {
          const language = block.language.replace(/[^\w-]/g, '')
          return (
            <pre className='markdown-code-block' key={blockIndex}>
              {language && <span className='code-language'>{language}</span>}
              <code>{block.content}</code>
            </pre>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={blockIndex}>
              <p>
                {block.lines.map((line, lineIndex) => (
                  <span key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInlineMarkdown(line)}
                  </span>
                ))}
              </p>
            </blockquote>
          )
        }

        if (block.type === 'table') {
          return (
            <div className='markdown-table-wrap' key={blockIndex}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        style={{ textAlign: block.alignments[cellIndex] }}
                      >
                        {renderInlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.headers.map((_, cellIndex) => (
                        <td
                          key={cellIndex}
                          style={{ textAlign: block.alignments[cellIndex] }}
                        >
                          {renderInlineMarkdown(row[cellIndex] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </List>
          )
        }

        return (
          <p key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInlineMarkdown(line)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function App() {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading])

  function startNewChat() {
    setMessages([])
    setPrompt('')
    inputRef.current?.focus()
  }

  async function send(event) {
    event.preventDefault()
    const message = prompt.trim()

    if (!message || isLoading) {
      return
    }

    setPrompt('')
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: 'user', content: message },
    ])
    setIsLoading(true)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: message,
      })
      const responseText = await response.text()

      if (!response.ok) {
        throw new Error(
          responseText || `Request failed: ${response.status} ${response.statusText}`,
        )
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: 'assistant',
          content: responseText || 'The assistant returned an empty response.',
        },
      ])
    } catch (requestError) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: 'error',
          content: requestError instanceof Error
            ? requestError.message
            : 'The request failed. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className='app-shell'>
      <aside className='sidebar'>
        <div className='sidebar-header'>
          <a className='brand' href='/' aria-label='Nova home'>
            <span className='brand-mark'>
              <SparkleIcon />
            </span>
            <span>nova</span>
          </a>
          <button
            className='sidebar-toggle'
            type='button'
            aria-label='Start a new chat'
            onClick={startNewChat}
          >
            <svg aria-hidden='true' viewBox='0 0 24 24' fill='none'>
              <path d='M14 5h5v5M19 5l-8 8' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' />
              <path d='M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' />
            </svg>
          </button>
        </div>

        <button className='new-chat-button' type='button' onClick={startNewChat}>
          <svg aria-hidden='true' viewBox='0 0 24 24' fill='none'>
            <path d='M12 5v14M5 12h14' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
          </svg>
          <span>New chat</span>
        </button>

        <div className='history-section'>
          <p className='sidebar-label'>Recent</p>
          {messages.length > 0 ? (
            <div className='history-item' title={messages[0].content}>
              <svg aria-hidden='true' viewBox='0 0 24 24' fill='none'>
                <path d='M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.5 4v-4.2A2.75 2.75 0 0 1 5 13.25v-7.5Z' stroke='currentColor' strokeWidth='1.6' strokeLinejoin='round' />
              </svg>
              <span>{messages[0].content}</span>
            </div>
          ) : (
            <p className='history-empty'>Your conversations will appear here.</p>
          )}
        </div>

        <div className='sidebar-footer'>
          <div className='profile-avatar'>N</div>
          <div className='profile-copy'>
            <span>Nova</span>
            <small>Personal workspace</small>
          </div>
          <span className='profile-menu' aria-hidden='true'>···</span>
        </div>
      </aside>

      <main className='chat-main'>
        <header className='topbar'>
          <div className='topbar-title'>
            <span className='mobile-brand-mark'><SparkleIcon /></span>
            <span>AI chat</span>
            <span className='model-badge'>Assistant</span>
          </div>
          <button className='topbar-new-chat' type='button' onClick={startNewChat}>
            <svg aria-hidden='true' viewBox='0 0 24 24' fill='none'>
              <path d='M12 5v14M5 12h14' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
            </svg>
            New chat
          </button>
        </header>

        <section className={`chat-content${messages.length === 0 ? ' chat-content--welcome' : ''}`}>
          {messages.length === 0 ? (
            <div className='welcome-panel'>
              <div className='welcome-icon'>
                <SparkleIcon />
              </div>
              <p className='eyebrow'>A LITTLE SPACE TO THINK</p>
              <h1>What can I help with?</h1>
              <p className='welcome-copy'>Ask a question, explore an idea, or get something started.</p>
              <div className='suggestion-grid'>
                {suggestions.map((suggestion) => (
                  <button
                    className='suggestion-card'
                    key={suggestion.title}
                    type='button'
                    onClick={() => {
                      setPrompt(suggestion.prompt)
                      inputRef.current?.focus()
                    }}
                  >
                    <span className='suggestion-icon'>{suggestion.icon}</span>
                    <span className='suggestion-text'>
                      <strong>{suggestion.title}</strong>
                      <small>{suggestion.description}</small>
                    </span>
                    <span className='suggestion-arrow' aria-hidden='true'>↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className='conversation' aria-live='polite'>
              {messages.map((message, index) => (
                <article className={`message message--${message.role}`} key={`${message.role}-${index}`}>
                  {message.role !== 'user' && (
                    <span className='message-avatar'>
                      {message.role === 'error' ? '!' : <SparkleIcon />}
                    </span>
                  )}
                  <div className='message-body'>
                    {message.role === 'assistant' && <p className='message-label'>Nova</p>}
                    {message.role === 'assistant' ? (
                      <MarkdownContent content={message.content} />
                    ) : (
                      <p className='message-content'>{message.content}</p>
                    )}
                  </div>
                </article>
              ))}
              {isLoading && (
                <article className='message message--assistant' role='status'>
                  <span className='message-avatar'><SparkleIcon /></span>
                  <div className='message-body'>
                    <p className='message-label'>Nova</p>
                    <div className='typing-indicator' aria-label='Thinking'>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </article>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <footer className='composer-area'>
          <form className='composer' onSubmit={send}>
            <label className='sr-only' htmlFor='chat-prompt'>Message Nova</label>
            <textarea
              id='chat-prompt'
              ref={inputRef}
              rows='1'
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Message Nova'
              disabled={isLoading}
            />
            <div className='composer-tools'>
              <span className='composer-hint'>Shift + Enter for a new line</span>
              <button
                className='send-button'
                type='submit'
                aria-label='Send message'
                disabled={isLoading || !prompt.trim()}
              >
                {isLoading ? (
                  <span className='send-spinner' aria-hidden='true' />
                ) : (
                  <svg aria-hidden='true' viewBox='0 0 24 24' fill='none'>
                    <path d='M12 19V5m0 0L6 11m6-6 6 6' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                  </svg>
                )}
              </button>
            </div>
          </form>
          <p className='disclaimer'>AI can make mistakes. Check important information.</p>
        </footer>
      </main>
    </div>
  )
}

export default App
