// Internal state.
var CURRENT_INPUT_GRID = new Grid(3, 3);
var CURRENT_OUTPUT_GRID = new Grid(3, 3);
var TEST_PAIRS = new Array();
var CURRENT_TEST_PAIR_INDEX = 0;
var COPY_PASTE_DATA = new Array();

// HackHunt state
var hackHuntStartTime = null;
var hackHuntTimerInterval = null;
var hackHuntTasksSolved = [];
var hackHuntSubmissions = [];
var hackHuntTasks = [];
var hackHuntTaskFilenames = []; // Track puzzle JSON filenames
var hackHuntCurrentIndex = 0;
var hackHuntIsFinished = false;

// Cosmetic.
var EDITION_GRID_HEIGHT = 500;
var EDITION_GRID_WIDTH = 500;
var MAX_CELL_SIZE = 100;

function resetTask() {
  CURRENT_INPUT_GRID = new Grid(3, 3);
  TEST_PAIRS = new Array();
  CURRENT_TEST_PAIR_INDEX = 0;
  $("#task_preview").html("");
  resetOutputGrid();
}

function refreshEditionGrid(jqGrid, dataGrid) {
  fillJqGridWithData(jqGrid, dataGrid);
  setUpEditionGridListeners(jqGrid);
  fitCellsToContainer(
    jqGrid,
    dataGrid.height,
    dataGrid.width,
    EDITION_GRID_HEIGHT,
    EDITION_GRID_HEIGHT,
  );
  initializeSelectable();
}

function syncFromEditionGridToDataGrid() {
  copyJqGridToDataGrid($("#output_grid .edition_grid"), CURRENT_OUTPUT_GRID);
}

function syncFromDataGridToEditionGrid() {
  refreshEditionGrid($("#output_grid .edition_grid"), CURRENT_OUTPUT_GRID);
}

function getSelectedSymbol() {
  selected = $("#symbol_picker .selected-symbol-preview")[0];
  return $(selected).attr("symbol");
}

function setUpEditionGridListeners(jqGrid) {
  jqGrid.find(".cell").click(function (event) {
    cell = $(event.target);
    symbol = getSelectedSymbol();

    mode = $("input[name=tool_switching]:checked").val();
    if (mode == "floodfill") {
      // If floodfill: fill all connected cells.
      syncFromEditionGridToDataGrid();
      grid = CURRENT_OUTPUT_GRID.grid;
      floodfillFromLocation(grid, cell.attr("x"), cell.attr("y"), symbol);
      syncFromDataGridToEditionGrid();
    } else if (mode == "edit") {
      // Else: fill just this cell.
      setCellSymbol(cell, symbol);
    }
  });
}

function resizeOutputGrid() {
  size = $("#output_grid_size").val();
  size = parseSizeTuple(size);
  if (!size) return;

  height = size[0];
  width = size[1];



  jqGrid = $("#output_grid .edition_grid");
  syncFromEditionGridToDataGrid();
  dataGrid = JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID.grid));
  CURRENT_OUTPUT_GRID = new Grid(height, width, dataGrid);
  refreshEditionGrid(jqGrid, CURRENT_OUTPUT_GRID);
}

function resetOutputGrid() {
  syncFromEditionGridToDataGrid();
  CURRENT_OUTPUT_GRID = new Grid(3, 3);
  syncFromDataGridToEditionGrid();
  resizeOutputGrid();
}

function copyFromInput() {
  syncFromEditionGridToDataGrid();
  var copiedGrid = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
  CURRENT_OUTPUT_GRID = new Grid(copiedGrid.height, copiedGrid.width, JSON.parse(JSON.stringify(copiedGrid.grid)));
  syncFromDataGridToEditionGrid();
  $("#output_grid_size").val(copiedGrid.height + "x" + copiedGrid.width);
}

function fillPairPreview(pairId, inputGrid, outputGrid) {
  var pairSlot = $("#pair_preview_" + pairId);
  if (!pairSlot.length) {
    // Create HTML for pair.
    pairSlot = $(
      '<div id="pair_preview_' +
        pairId +
        '" class="pair_preview" index="' +
        pairId +
        '"></div>',
    );
    pairSlot.appendTo("#task_preview");
  }
  var jqInputGrid = pairSlot.find(".input_preview");
  if (!jqInputGrid.length) {
    jqInputGrid = $('<div class="input_preview"></div>');
    jqInputGrid.appendTo(pairSlot);
  }
  var jqOutputGrid = pairSlot.find(".output_preview");
  if (!jqOutputGrid.length) {
    jqOutputGrid = $('<div class="output_preview"></div>');
    jqOutputGrid.appendTo(pairSlot);
  }

  fillJqGridWithData(jqInputGrid, inputGrid);
  fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 200, 200);
  fillJqGridWithData(jqOutputGrid, outputGrid);
  fitCellsToContainer(
    jqOutputGrid,
    outputGrid.height,
    outputGrid.width,
    200,
    200,
  );
}

function loadJSONTask(train, test) {
  resetTask();
  $("#modal_bg").hide();
  $("#error_display").hide();
  $("#info_display").hide();

  for (var i = 0; i < train.length; i++) {
    pair = train[i];
    values = pair["input"];
    input_grid = convertSerializedGridToGridObject(values);
    values = pair["output"];
    output_grid = convertSerializedGridToGridObject(values);
    fillPairPreview(i, input_grid, output_grid);
  }
  for (var i = 0; i < test.length; i++) {
    pair = test[i];
    TEST_PAIRS.push(pair);
  }
  values = TEST_PAIRS[0]["input"];
  CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values);
  fillTestInput(CURRENT_INPUT_GRID);
  CURRENT_TEST_PAIR_INDEX = 0;
  $("#current_test_input_id_display").html("1");
  $("#total_test_input_count_display").html(test.length);
}

function display_task_name(task_name, task_index, number_of_tasks) {
  big_space = "&nbsp;".repeat(4);
  document.getElementById("task_name").innerHTML =
    "Task name:" +
    big_space +
    task_name +
    big_space +
    (task_index === null
      ? ""
      : String(task_index) + " out of " + String(number_of_tasks));
}

function loadTaskFromFile(e) {
  var file = e.target.files[0];
  if (!file) {
    errorMsg("No file selected");
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var contents = e.target.result;

    try {
      contents = JSON.parse(contents);
      train = contents["train"];
      test = contents["test"];
    } catch (e) {
      errorMsg("Bad file format");
      return;
    }
    loadJSONTask(train, test);

    $("#load_task_file_input")[0].value = "";
    display_task_name(file.name, null, null);
  };
  reader.readAsText(file);
}

function randomTask() {
  var subset = "training";
  $.getJSON(
    "https://api.github.com/repos/fchollet/ARC/contents/data/" + subset,
    function (tasks) {
      var task_index = Math.floor(Math.random() * tasks.length);
      var task = tasks[task_index];
      $.getJSON(task["download_url"], function (json) {
        try {
          train = json["train"];
          test = json["test"];
        } catch (e) {
          errorMsg("Bad file format");
          return;
        }
        loadJSONTask(train, test);
        //$('#load_task_file_input')[0].value = "";
        infoMsg("Loaded task training/" + task["name"]);
        display_task_name(task["name"], task_index, tasks.length);
      }).error(function () {
        errorMsg("Error loading task");
      });
    },
  ).error(function () {
    errorMsg("Error loading task list");
  });
}

function startHackHunt() {
  $("#start_hackhunt_btn").prop("disabled", true).text("Loading Tasks...");

  // 9 curated puzzles: Easy (1-3), Medium (4-6), Hard (7-9)
  var allFiles = [
    // Easy — 3x3, single-step geometric rules
    "6150a2bd.json",  // Task 1: 180° rotation
    "25ff71a9.json",  // Task 2: shift pattern down 1 row
    "0d3d703e.json",  // Task 3: fixed color-mapping
    // Medium — larger grids, multi-step rules
    "3618c87e.json",  // Task 4: 5x5 gravity drop
    "1b2d62fb.json",  // Task 5: 5x7→5x3 spot-the-diff
    "54d9e175.json",  // Task 6: 3x11 number-to-color per cell block
    // Hard — compositional / structural reasoning
    "007bbfb7.json",  // Task 7: 3x3→9x9 self-tiling
    "4522001f.json",  // Task 8: 3x3→9x9 cell scaling at pivot
    "239be575.json",  // Task 9: variable input → binary [[0]] or [[8]]
  ];

  var fetchPromises = allFiles.map((filename) =>
    $.getJSON("data/training/" + filename),
  );

  $.when
    .apply($, fetchPromises)
    .done(function () {
      var args = fetchPromises.length === 1 ? [arguments] : arguments;
      for (var i = 0; i < allFiles.length; i++) {
        hackHuntTasks.push(args[i][0]);
        hackHuntTaskFilenames.push(allFiles[i]);
        hackHuntTasksSolved.push(false);
        hackHuntSubmissions.push(null);
      }

      var total = hackHuntTasks.length;

      // Generate nav buttons dynamically
      var navHtml = "";
      for (var i = 0; i < total; i++) {
        navHtml +=
          '<button id="nav_btn_' +
          i +
          '" onclick="switchHackHuntTask(' +
          i +
          ')" class="nav-button">Task ' +
          (i + 1) +
          "</button>";
      }
      $("#hackhunt_nav_buttons").html(navHtml);

      // Update solved count denominator
      $("#hackhunt_total_count").text(total);

      hackHuntStartTime = Date.now();
      hackHuntTimerInterval = setInterval(updateHackHuntTimer, 1000);

      $("#modal_bg").hide();
      $("#hackhunt_dashboard").show();

      switchHackHuntTask(0);
    })
    .fail(function () {
      errorMsg("Failed to fetch tasks.");
      $("#start_hackhunt_btn").prop("disabled", false).text("Start HackHunt");
    });
}

function updateHackHuntTimer() {
  var now = Date.now();
  var diff = Math.floor((now - hackHuntStartTime) / 1000);
  var min = Math.floor(diff / 60)
    .toString()
    .padStart(2, "0");
  var sec = (diff % 60).toString().padStart(2, "0");
  $("#hackhunt_timer").text(min + ":" + sec);
}

function switchHackHuntTask(index) {
  if (hackHuntTasks.length === 0) return;
  var oldIndex = hackHuntCurrentIndex;

  // Save current state if we have a task loaded and an edition grid present
  if (
    hackHuntStartTime !== null &&
    $("#output_grid .edition_grid").length > 0
  ) {
    syncFromEditionGridToDataGrid();
    hackHuntSubmissions[oldIndex] = JSON.parse(
      JSON.stringify(CURRENT_OUTPUT_GRID.grid),
    );
  }

  // Update nav buttons
  $("#hackhunt_nav_buttons button").removeClass("active-nav-btn");
  $("#nav_btn_" + index).addClass("active-nav-btn");

  hackHuntCurrentIndex = index;
  var task = hackHuntTasks[index];



  // Load task
  loadJSONTask(task["train"], task["test"]);

  // Display puzzle filename for event coordinators
  $("#hackhunt_puzzle_id").text("Puzzle: " + hackHuntTaskFilenames[index]);

  // Restore saved grid if exists
  if (hackHuntSubmissions[index] !== null) {
    var savedGrid = hackHuntSubmissions[index];
    var h = savedGrid.length, w = savedGrid[0] ? savedGrid[0].length : 3;
    CURRENT_OUTPUT_GRID = new Grid(h, w, savedGrid);
    $("#output_grid_size").val(h + "x" + w);
    syncFromDataGridToEditionGrid();
  } else {
    // Start with 3x3 blank — user can resize with the Resize button
    CURRENT_OUTPUT_GRID = new Grid(3, 3);
    syncFromDataGridToEditionGrid();
    $("#output_grid_size").val("3x3");
  }
}

function nextTestInput() {
  if (TEST_PAIRS.length <= CURRENT_TEST_PAIR_INDEX + 1) {
    errorMsg("No next test input. Pick another file?");
    return;
  }
  CURRENT_TEST_PAIR_INDEX += 1;
  values = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]["input"];
  CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values);
  fillTestInput(CURRENT_INPUT_GRID);
  $("#current_test_input_id_display").html(CURRENT_TEST_PAIR_INDEX + 1);
  $("#total_test_input_count_display").html(test.length);
}

function submitSolution() {
  syncFromEditionGridToDataGrid();
  reference_output = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]["output"];
  submitted_output = CURRENT_OUTPUT_GRID.grid;
  if (reference_output.length != submitted_output.length) {
    errorMsg("Wrong solution.");
    return;
  }
  for (var i = 0; i < reference_output.length; i++) {
    ref_row = reference_output[i];
    for (var j = 0; j < ref_row.length; j++) {
      if (ref_row[j] != submitted_output[i][j]) {
        errorMsg("Wrong solution.");
        return;
      }
    }
  }
  infoMsg("Correct solution!");

  // HackHunt logic
  if (hackHuntStartTime !== null) {
    if (!hackHuntTasksSolved[hackHuntCurrentIndex]) {
      hackHuntTasksSolved[hackHuntCurrentIndex] = true;
      $("#nav_btn_" + hackHuntCurrentIndex)
        .css("background-color", "#4CAF50")
        .css("color", "white");

      var solvedCount = hackHuntTasksSolved.filter((x) => x).length;
      var total = hackHuntTasks.length;
      $("#hackhunt_solved_count").text(solvedCount);

      if (solvedCount === total) {
        // All solved! Timer stops, user can still review answers.
        clearInterval(hackHuntTimerInterval);
        infoMsg(
          "You have successfully completed all " +
            total +
            " tasks in " +
            $("#hackhunt_timer").text() +
            "! You may continue to review your answers.",
        );
      }
    }
  }
}

function fillTestInput(inputGrid) {
  jqInputGrid = $("#evaluation_input");
  fillJqGridWithData(jqInputGrid, inputGrid);
  fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 400, 400);
}

function copyToOutput() {
  syncFromEditionGridToDataGrid();
  var copiedGrid = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
  CURRENT_OUTPUT_GRID = new Grid(copiedGrid.height, copiedGrid.width, JSON.parse(JSON.stringify(copiedGrid.grid)));
  syncFromDataGridToEditionGrid();
  $("#output_grid_size").val(copiedGrid.height + "x" + copiedGrid.width);
}

function initializeSelectable() {
  try {
    $(".selectable_grid").selectable("destroy");
  } catch (e) {}
  toolMode = $("input[name=tool_switching]:checked").val();
  if (toolMode == "select") {
    infoMsg(
      "Select some cells and click on a color to fill in, or press C to copy",
    );
    $(".selectable_grid").selectable({
      autoRefresh: false,
      filter: "> .row > .cell",
      start: function (event, ui) {
        $(".ui-selected").each(function (i, e) {
          $(e).removeClass("ui-selected");
        });
      },
    });
  }
}

// Initial event binding.

$(document).ready(function () {
  $("#symbol_picker")
    .find(".symbol_preview")
    .click(function (event) {
      symbol_preview = $(event.target);
      $("#symbol_picker")
        .find(".symbol_preview")
        .each(function (i, preview) {
          $(preview).removeClass("selected-symbol-preview");
        });
      symbol_preview.addClass("selected-symbol-preview");

      toolMode = $("input[name=tool_switching]:checked").val();
      if (toolMode == "select") {
        $(".edition_grid")
          .find(".ui-selected")
          .each(function (i, cell) {
            symbol = getSelectedSymbol();
            setCellSymbol($(cell), symbol);
          });
      }
    });

  $(".edition_grid").each(function (i, jqGrid) {
    setUpEditionGridListeners($(jqGrid));
  });

  $(".load_task").on("change", function (event) {
    loadTaskFromFile(event);
  });

  $(".load_task").on("click", function (event) {
    event.target.value = "";
  });

  $("input[type=radio][name=tool_switching]").change(function () {
    initializeSelectable();
  });

  $("input[type=text][name=size]").on("keydown", function (event) {
    if (event.keyCode == 13) {
      resizeOutputGrid();
    }
  });

  $("body").keydown(function (event) {
    // Copy and paste functionality.
    if (event.which == 67) {
      // Press C

      selected = $(".ui-selected");
      if (selected.length == 0) {
        return;
      }

      COPY_PASTE_DATA = [];
      for (var i = 0; i < selected.length; i++) {
        x = parseInt($(selected[i]).attr("x"));
        y = parseInt($(selected[i]).attr("y"));
        symbol = parseInt($(selected[i]).attr("symbol"));
        COPY_PASTE_DATA.push([x, y, symbol]);
      }
      infoMsg(
        "Cells copied! Select a target cell and press V to paste at location.",
      );
    }
    if (event.which == 86) {
      // Press P
      if (COPY_PASTE_DATA.length == 0) {
        errorMsg("No data to paste.");
        return;
      }
      selected = $(".edition_grid").find(".ui-selected");
      if (selected.length == 0) {
        errorMsg("Select a target cell on the output grid.");
        return;
      }

      jqGrid = $(selected.parent().parent()[0]);

      if (selected.length == 1) {
        targetx = parseInt(selected.attr("x"));
        targety = parseInt(selected.attr("y"));

        xs = new Array();
        ys = new Array();
        symbols = new Array();

        for (var i = 0; i < COPY_PASTE_DATA.length; i++) {
          xs.push(COPY_PASTE_DATA[i][0]);
          ys.push(COPY_PASTE_DATA[i][1]);
          symbols.push(COPY_PASTE_DATA[i][2]);
        }

        minx = Math.min(...xs);
        miny = Math.min(...ys);
        for (var i = 0; i < xs.length; i++) {
          x = xs[i];
          y = ys[i];
          symbol = symbols[i];
          newx = x - minx + targetx;
          newy = y - miny + targety;
          res = jqGrid.find('[x="' + newx + '"][y="' + newy + '"] ');
          if (res.length == 1) {
            cell = $(res[0]);
            setCellSymbol(cell, symbol);
          }
        }
      } else {
        errorMsg(
          "Can only paste at a specific location; only select *one* cell as paste destination.",
        );
      }
    }
  });
});
