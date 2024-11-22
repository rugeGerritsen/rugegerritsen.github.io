function show_reverts_selected() {
    return document.getElementById('checkbox_show_reverted').checked;
}

function shaToLink(repo_name, sha) {
    const short_sha = sha.substring(0, 10);
    return `<a href="${repo_name}/commit/${sha}">${short_sha}</a>`;
}

function prToLink(repo_name, pr_number) {
    return `<a href="${repo_name}/pull/${pr_number}">#${pr_number}</a>`;
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
    updateNoUpTable(data);
    updateRevertedDownstreamTable(data);
}

function filterColumn(table, input, column, summary_lbl) {
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

    let totalCount = 0;
    let visibleCount = 0;
    for (let i = 2; i < newTable.rows.length; i++) {
        const row = newTable.rows[i]; // Access each row
        const cell_value = row.cells[column].innerText;

        totalCount++;

        if (cell_value.match(regex)) {
            visibleCount++;
            row.style.display = "table-row";
        } else {
            row.style.display = "none";
        }
    }

    // Need to re-add event listeners as those are not cloned.
    for (let i = 0; i < newTable.rows[1].cells.length; i++) {
        var cell = newTable.rows[1].cells[i];
        const input = cell.children[0];
        
        if (i != column) {
            input.value = '.*';
        }

        /* Add listener for the filter key. */
        input.addEventListener('input', () => {
            filterColumn(newTable, input.value, i, summary_lbl)
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

    const label = document.getElementById(summary_lbl);
    label.innerHTML = "Showing " + visibleCount + " out of " + totalCount + " elements. ";
}

function updateTable(table, headerRow, template, commits, summary_lbl) {
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
            filterColumn(table, input.value, index, summary_lbl)
        });
    }
    table.appendChild(row);

    const show_reverts = show_reverts_selected();

    let commitCount = 0;
    commits.forEach(item => {
        if ((!item.reverted_by_sha && !item.reverts_sha) || show_reverts) {
            commitCount++;
            row = table.insertRow()
            template.forEach(entry => {
                const cell = document.createElement("td");
                const val = entry(item);
                if (val) {
                    cell.innerHTML = val;
                } else {
                    cell.innerText = "";
                }

                row.appendChild(cell);
            });
        }
    });

    const label = document.getElementById(summary_lbl);
    label.innerHTML = "Showing " + commitCount + " out of " + commitCount + " elements.";
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
        { title: "Data was obtained at", val: utcSecondsToDate(data.meta.authored_seconds_since_epoch) },
        { title: "Last rebase/Merge base SHA", val: shaToLink(data.meta.downstream_url, data.merge_base.sha) },
        { title: "Last rebase/Merge base timestamp", val: utcSecondsToDate(data.merge_base.authored_seconds_since_epoch) },
        { title: "", val: "" },
        { title: "Number of commits upstream after last rebase/Merge base", val: data.upstream_commits.length },
        { title: "Number of downstream commits after last rebase/Merge base", val: data.downstream_commits.length },
        {
            title: "Number of reverted downstream commits after last rebase/Merge base",
            val: data.downstream_commits.filter(entry => entry.reverted_by_sha).length
        },
        { title: "", val: "" },
        {
            title: "Number of downstream noup commits",
            val: data.downstream_commits.filter(item => !item.reverted_by_sha && item.title.startsWith("[nrf noup]")).length
        },
        {
            title: "Number of downstream fromtree commits",
            val: data.downstream_commits.filter(item => !item.reverted_by_sha && item.title.startsWith("[nrf fromtree]")).length
        },
        {
            title: "Number of downstream fromlist commits",
            val: data.downstream_commits.filter(item => !item.reverted_by_sha && item.title.startsWith("[nrf fromlist]")).length
        },
        {
            title: "Number of downstream fromlist commits likely merged",
            val: data.downstream_commits.filter(item => !item.reverted_by_sha && item.title.startsWith("[nrf fromlist]")).filter(item => item.upstream_sha_guess).length
        },
        {
            title: "Number of downstream fromlist commits likely not yet merged",
            val: data.downstream_commits.filter(item => !item.reverted_by_sha && item.title.startsWith("[nrf fromlist]")).filter(item => !item.upstream_sha_guess).length
        },
        { title: "", val: "" },
        {
            title: "Number of commits upstream only",
            val: data.upstream_commits.filter(entry => !(entry.downstream_sha || entry.downstream_sha_guess)).length
        }
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

    let headerRow = [
        'Title',
        'SHA',
        'Authored date',
        'Committed date',
        'Upstream PR',
        'Author'];
    let template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.downstream_url, item.sha),
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => item['upstream_pr'] ? prToLink(data.meta.upstream_url, item.upstream_pr) : "",
        (item) => item.author,
    ];

    if (show_reverts_selected()) {
        headerRow.push('Reverted by');
        template.push((item) => item.reverted_by_sha ? shaToLink(data.meta.downstream_url, item.reverted_by_sha) : "");
    }

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => !(entry.upstream_sha || entry.upstream_sha_guess)),
        'lbl_commits_only_downstream_count');
}

function updateUpstreamOnlyTable(data) {
    var table = document.getElementById('tbl_commits_not_downstream');
    table.innerHTML = "";

    var headerRow = [
        'Title',
        'SHA',
        'Authored date',
        'Committed date',
        'Author'];
    const template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.upstream_url, item.sha),
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => item.author
    ];

    updateTable(table, headerRow, template,
        data.upstream_commits.filter(entry => !(entry.downstream_sha || entry.downstream_sha_guess)),
        'lbl_commits_not_downstream_count');
}

function updateFromListTable(data) {
    var table = document.getElementById('tbl_commits_fromlist');
    table.innerHTML = "";

    const headerRow = [
        'Title',
        'SHA',
        'Authored date',
        'Committed date',
        'Upstream PR / Guessed upstream SHA',
        'Author'];
    const template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.downstream_url, item.sha),
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => {
            const pr_link = item['upstream_pr'] ? prToLink(data.meta.upstream_url, item.upstream_pr) : "";
            const upstream_sha_guess = item['upstream_sha_guess'] ? shaToLink(data.meta.upstream_url, item.upstream_sha_guess) : "";
            if (pr_link && upstream_sha_guess) {
                return pr_link + ' / ' + upstream_sha_guess;
            } else if (pr_link) {
                return pr_link;
            } else {
                return upstream_sha_guess;
            }
        },
        (item) => item.author
    ];

    if (show_reverts_selected()) {
        headerRow.push('Reverted by');
        template.push((item) => item.reverted_by_sha ? shaToLink(data.meta.downstream_url, item.reverted_by_sha) : "");
    }

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => entry.upstream_pr),
        'lbl_commits_fromlist_count');
}

function updateFromTreeTable(data) {
    var table = document.getElementById('tbl_commits_fromtree');
    table.innerHTML = "";

    const headerRow = [
        'Title',
        'SHA',
        'Upstream SHA',
        'Authored date',
        'Committed date',
        'Author'];
    const template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.downstream_url, item.sha),
        (item) => item['upstream_sha'] ? shaToLink(data.meta.upstream_url, item.upstream_sha) : "",
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => item.author
    ];

    if (show_reverts_selected()) {
        headerRow.push('Reverted by');
        template.push((item) => item.reverted_by_sha ? shaToLink(data.meta.downstream_url, item.reverted_by_sha) : "");
    }

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => entry.upstream_sha),
        'lbl_commits_fromtree_count');
}

function updateNoUpTable(data) {
    var table = document.getElementById('tbl_commits_noup');
    table.innerHTML = "";

    const headerRow = [
        'Title',
        'SHA',
        'Authored date',
        'Committed date',
        'Author'];
    const template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.downstream_url, item.sha),
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => item.author
    ];

    if (show_reverts_selected()) {
        headerRow.push('Reverted by');
        template.push((item) => item.reverted_by_sha ? shaToLink(data.meta.downstream_url, item.reverted_by_sha) : "");
    }

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => entry.title.startsWith("[nrf noup]")),
        'lbl_commits_noup_count');
}

function updateRevertedDownstreamTable(data) {
    var table = document.getElementById('tbl_commits_reverted_downstream');
    table.innerHTML = "";

    const headerRow = [
        'Title',
        'SHA',
        'Reverted by',
        'Authored date',
        'Committed date',
        'Author'];
    const template = [
        (item) => item.title,
        (item) => shaToLink(data.meta.downstream_url, item.sha),
        (item) => shaToLink(data.meta.downstream_url, item.reverted_by_sha),
        (item) => utcSecondsToDate(item.authored_seconds_since_epoch),
        (item) => utcSecondsToDate(item.committed_seconds_since_epoch),
        (item) => item.author
    ];

    updateTable(table, headerRow, template,
        data.downstream_commits.filter(entry => entry.reverted_by_sha),
        'lbl_commits_reverted_downstream_count');
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
    document.getElementById("defaultOpen").click();
}

