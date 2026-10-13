import path from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const accountKey = process.env.BACK4APP_ACCOUNT_KEY?.trim()
const applicationId = process.env.BACK4APP_APPLICATION_ID?.trim()

if (!accountKey || !applicationId) {
  throw new Error('BACK4APP_ACCOUNT_KEY and BACK4APP_APPLICATION_ID are required.')
}

if (!/^[A-Za-z0-9]+$/.test(applicationId)) {
  throw new Error(
    'BACK4APP_APPLICATION_ID must contain only letters and numbers; check for pasted whitespace or punctuation.',
  )
}

const repositoryRoot = process.cwd()
const cloudCodePath = path.resolve(repositoryRoot, 'cloud/main.js')
const serverPath = process.env.BACK4APP_MCP_SERVER_PATH
  || path.resolve(
    repositoryRoot,
    'node_modules/@back4app/mcp-server-back4app/dist/index.js',
  )
const sdkRootCandidates = [
  path.resolve(path.dirname(serverPath), '../../../@modelcontextprotocol/sdk'),
  path.resolve(path.dirname(serverPath), '../node_modules/@modelcontextprotocol/sdk'),
]
const sdkRoot = sdkRootCandidates.find(candidate => existsSync(candidate))

if (!sdkRoot) {
  throw new Error('Could not locate the Model Context Protocol SDK next to the Back4App MCP server.')
}

const { Client } = await import(
  pathToFileURL(path.join(sdkRoot, 'dist/esm/client/index.js')).href,
)
const { StdioClientTransport } = await import(
  pathToFileURL(path.join(sdkRoot, 'dist/esm/client/stdio.js')).href,
)

const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined),
)
childEnvironment.BACK4APP_ACCOUNT_KEY = accountKey

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: repositoryRoot,
  env: childEnvironment,
})

const client = new Client(
  {
    name: 'derbyshire-water-github-action',
    version: '1.0.0',
  },
  { capabilities: {} },
)

try {
  await client.connect(transport)

  const result = await client.callTool({
    name: 'deploy_cloud_code_files',
    arguments: {
      applicationId,
      files: [
        {
          path: 'main.js',
          localPath: cloudCodePath,
          encoding: 'utf8',
        },
      ],
      description: `GitHub Actions ${process.env.GITHUB_SHA || 'manual run'}`,
    },
  })

  if (result.isError) {
    const errorText = result.content
      ?.filter(content => content.type === 'text')
      .map(content => content.text)
      .join('\n')
    throw new Error(errorText || 'Back4App MCP deployment failed.')
  }

  const output = result.content
    ?.filter(content => content.type === 'text')
    .map(content => content.text)
    .join('\n')

  if (output) console.log(output)
  console.log('Back4App Cloud Code deployment completed.')
} finally {
  try {
    await client.close()
  } catch (error) {
    console.error(
      `Could not close the Back4App MCP connection cleanly: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
