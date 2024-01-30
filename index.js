import { markdownTable } from 'markdown-table'
import axios from 'axios'
import github from '@actions/github'
import core from '@actions/core'


const getParameters = () => {
    return {
        githubToken: core.getInput('GITHUB_TOKEN'),
        sonarqubeHost: core.getInput('SONAR_HOST').replace('https://', '').replace('http://', ''),
        sonarqubeToken: core.getInput('SONAR_TOKEN'),
        sonarqubeProjectKey: core.getInput('SONAR_PROJECT_KEY'),
    }
}

const getQueryHeaders = () => {
    const { sonarqubeToken } = getParameters()
    const basicAuthToken = `${sonarqubeToken}:`
    return {
        headers: {
            'Authorization': `Basic ${Buffer.from(basicAuthToken).toString('base64')}`
        }
    }
}

const verifyToken = async (sonarHost) => {
    return axios.get(`https://${sonarHost}/api/authentication/validate`, getQueryHeaders())
}

const getResults = async (sonarHost, sonarProject) => {
    const results = await axios.get(`https://${sonarHost}/api/measures/component?component=${sonarProject}&metricKeys=new_technical_debt,new_security_hotspots_to_review_status,new_vulnerabilities,new_bugs,new_code_smells`, getQueryHeaders())
    return results.data
}

const createMarkdownMessage = (results) => {
    const { component: { name, measures } } = results
    const table = measures.map(measure => ([
        measure.metric.replaceAll('_', ' '),
        measure.period.value
    ]))
    return `### Analysis results for project ${name}\n\n${markdownTable([["Metric", "Count"], ...table])}`
}

const publishComment = async (githubToken, comment) => {
    const octokit = github.getOctokit(githubToken)
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: 'launchmetrics',
        repo: 'LM-Security',
        issue_number: '205',
        body: comment,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
}

const exec = async () => {

    console.log(JSON.stringify(github.context))

    const { githubToken, sonarqubeHost, sonarqubeProjectKey } = getParameters()
    const { data: authenticationResult } = await verifyToken(sonarqubeHost)

    if (!authenticationResult.valid) {
        throw new Error('The authentication with the server failed')
    }

    try {
        const results = await getResults(sonarqubeHost, sonarqubeProjectKey)
        const message = createMarkdownMessage(results)
        try {
            await publishComment(githubToken, message)
        } catch (err) {
            throw new Error('Invalid github token')
        }
    }
    catch (err) {
        throw new Error('Invalid sonarqube project key')
    }

}

exec().then(() => core.setOutput('Comment successfully published')).catch(err => {
    core.setFailed(err.message);
})
