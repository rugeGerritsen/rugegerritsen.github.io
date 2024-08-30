
function countNoUpCommits(data) {
    return data.downstream_commits.filter(data => data.title.startsWith("[nrf noup]")).length;
}

function countFromListCommits(data) {
    return data.downstream_commits.filter(data => data.title.startsWith("[nrf fromlist]")).length;
}

function countFromTreeCommits(data) {
    return data.downstream_commits.filter(data => data.title.startsWith("[nrf fromtree]")).length;
}

function countCommitsToBeSynced(data) {
    return data.upstream_commits.length - countFromListCommits(data);
}

function shaToLink(repo_name, sha) {
    const short_sha = sha.substring(0, 10);
    return `<a href="${repo_name}/commit/${sha}">${short_sha}</a>`;
}

function prToLink(prLink) {
    const pr_number = prLink.split('/').at(-1);
    return `<a href="${prLink}">#${pr_number}</a>`;
}

function utcSecondsToDate(utcSeconds) {
    var timestamp = new Date(0);
    timestamp.setUTCSeconds(utcSeconds);

    return timestamp.toISOString().slice(0, 10);
}

function displayData(data) {
    updateDataSourceTable(data);
    updateDownstreamOnlyTable(data);
    updateUpstreamOnlyTable(data);
    updateFromListTable(data);
    updateFromTreeTable(data);

    document.getElementById("defaultOpen").click();
}

function filterColumn(table, input, column) {
    var regex;
    try {
        regex = new RegExp('^' + input + '$');
        table.rows[1].cells[column].style.backgroundColor = "green";
    } catch {
        table.rows[1].cells[column].style.backgroundColor = "red";
        return;
    }

    /* Update a clone of table instead of updating it in place.
     * This is way much faster for larger tables. */
    var newTable = table.cloneNode(true)

    for (let i = 2; i < newTable.rows.length; i++) {
        const row = newTable.rows[i]; // Access each row
        const cell_value = row.cells[column].innerText;

        if (cell_value.match(regex)) {
            row.style.display = "table-row";
        } else {
            row.style.display = "none";
        }
    }

    // Need to re-add event listeners as those are not cloned.
    for (let i = 0; i < newTable.rows[1].cells.length; i++) {
        var cell = newTable.rows[1].cells[i];
        const input = cell.children[0];

        /* Add listener for the filter key. */
        input.addEventListener('input', () => {
            filterColumn(newTable, input.value, i)
        });
    }

    /* Replace the old table, and make sure the new input box gets focus */
    table.parentNode.replaceChild(newTable, table);

    let old_selection_start = table.rows[1].cells[column].children[0].selectionStart;
    let old_selection_end = table.rows[1].cells[column].children[0].selectionEnd;

    newTable.rows[1].cells[column].children[0].setSelectionRange(
        old_selection_start,
        old_selection_end,
    )
    newTable.rows[1].cells[column].children[0].focus()
}

function updateTable(table, headerRow, template, commits) {
    row = table.insertRow();
    row.style.backgroundColor = "#333f67";
    row.style.color = "white";
    Object.values(headerRow).forEach(text => {
        const cell = document.createElement("td");
        cell.innerHTML = text;
        row.appendChild(cell);
    });
    table.appendChild(row);

    row = table.insertRow();
    for (let index = 0; index < headerRow.length; index++) {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        input.value = '.*'
        cell.style.backgroundColor = "green";

        cell.appendChild(input);
        row.appendChild(cell);

        /* Add listener for the filter key. */
        input.addEventListener('input', () => {
            filterColumn(table, input.value, index)
        });
    }
    table.appendChild(row);

    commits.forEach(item => {
        row = table.insertRow()
        Object.keys(template).forEach(entry => {
            const cell = document.createElement("td");
            const val = item[entry];
            if (val) {
                cell.innerHTML = template[entry](val);
            } else {
                cell.innerText = "";
            }

            row.appendChild(cell);
        });
    });
}

function updateDataSourceTable(data) {
    var table = document.getElementById('tbl_data_config');
    table.innerHTML = "";

    const entries = [
        { title: "<b>Name</b>", val: "<b>Value</b>" },
        { title: "Upstream URL", val: data.meta.upstream_url },
        { title: "Upstream revision", val: data.meta.upstream_rev },
        { title: "Downstream URL", val: data.meta.downstream_url },
        { title: "Downstream revision", val: data.meta.downstream_rev },
        { title: "Data was obtained at", val: utcSecondsToDate(data.meta.seconds_since_epoch) },
        { title: "Last rebase/Merge base SHA", val: shaToLink(data.meta.downstream_url, data.merge_base.sha) },
        { title: "Last rebase/Merge base timestamp", val: utcSecondsToDate(data.merge_base.seconds_since_epoch) },
        { title: "Number of noup commits", val: countNoUpCommits(data) },
        { title: "Number of fromlist commits", val: countFromListCommits(data) },
        { title: "Number of fromtree commits", val: countFromTreeCommits(data) },
        { title: "Number of commits upstream only", val: countCommitsToBeSynced(data) }
    ];

    entries.forEach(item => {
        const row = document.createElement("tr");
        Object.values(item).forEach(text => {
            const cell = document.createElement("td");
            cell.innerHTML = text;
            row.appendChild(cell);
        });
        table.appendChild(row);
    });
}

function updateDownstreamOnlyTable(data) {
    var table = document.getElementById('tbl_commits_only_downstream');
    table.innerHTML = "";

    const headerRow = ['Title', 'SHA', 'Committed date', 'Upstream PR', 'Author'];
    const template = {
        title: (title) => title,
        sha: (sha) => shaToLink(data.meta.downstream_url, sha),
        seconds_since_epoch: (time) => utcSecondsToDate(time),
        upstream_pr: (upstream_pr) => prToLink(upstream_pr),
        author: (author) => author
    };

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => !entry.upstream_sha));
}

function updateUpstreamOnlyTable(data) {
    var table = document.getElementById('tbl_commits_not_downstream');
    table.innerHTML = "";

    const headerRow = ['Title', 'SHA', 'Committed date', 'Author'];
    const template = {
        title: (title) => title,
        sha: (sha) => shaToLink(data.meta.upstream_url, sha),
        seconds_since_epoch: (time) => utcSecondsToDate(time),
        author: (author) => author
    };

    updateTable(table, headerRow, template,
        data.upstream_commits.filter(entry => !entry.downstream_sha));
}

function updateFromListTable(data) {
    var table = document.getElementById('tbl_commits_fromlist');
    table.innerHTML = "";

    const headerRow = ['Title', 'SHA', 'Committed date', 'Upstream PR', 'Author'];
    const template = {
        title: (title) => title,
        sha: (sha) => shaToLink(data.meta.downstream_url, sha),
        seconds_since_epoch: (time) => utcSecondsToDate(time),
        upstream_pr: (upstream_pr) => prToLink(upstream_pr),
        author: (author) => author
    };

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => entry.upstream_pr));
}

function updateFromTreeTable(data) {
    var table = document.getElementById('tbl_commits_fromtree');
    table.innerHTML = "";

    const headerRow = ['Title', 'SHA', 'Downstream SHA', 'Committed date', 'Author'];
    const template = {
        title: (title) => title,
        sha: (sha) => shaToLink(data.meta.upstream_url, sha),
        downstream_sha: (sha) => shaToLink(data.meta.downstream_url, sha),
        seconds_since_epoch: (time) => utcSecondsToDate(time),
        author: (author) => author
    };

    updateTable(table, headerRow, template,
        data.upstream_commits.filter(entry => entry.downstream_sha));
}

function openTab(evt, tabName) {
    // Declare all variables
    var i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

function loadFromCache() {
    fetch('data/data.json')
        .then(data => data.json())
        .then(data => displayData(data));
}

function loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';

    input.onchange = e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = event => {
                displayData(JSON.parse(event.target.result));
            };
            reader.readAsText(file);
        }
    };
    input.click()
}

function onPageLoad() {
    let input_data_src = document.querySelectorAll('input[name="radio_data_src"]');

    input_data_src.forEach((radio_btn) => {
        radio_btn.addEventListener('change', (event) => {
            event.stopImmediatePropagation()
            if (event.target.id == 'option_server_data') {
                loadFromCache();
            } else if (event.target.id == 'option_upload') {
                loadFromFile();
            }
        });
    });

    loadFromCache();
}

