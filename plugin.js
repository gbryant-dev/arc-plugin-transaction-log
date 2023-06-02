arc.run([
  '$rootScope',
  function ($rootScope) {
    $rootScope.plugin('arcTransactionLogs', 'Transaction Logs', 'page', {
      menu: 'tools',
      icon: 'fa-tasks',
      description: 'This plugin is to query transaction logs',
      author: 'George Bryant',
      url: 'https://github.com/gbryant-dev/arc-plugin-transaction-log',
      version: '1.0.0'
    })
  }
])

arc.directive('arcTransactionLogs', function () {
  return {
    restrict: 'EA',
    replace: true,
    scope: {
      instance: '=tm1Instance'
    },
    templateUrl: '__/plugins/transaction-log/template.html',
    link: function ($scope, element, attrs) {},
    controller: [
      '$scope',
      '$rootScope',
      '$helper',
      function ($scope, $rootScope, $helper) {
        var loadTimeout
        $scope.isPaused = false
        $scope.activeOnly = false
        $scope.selections = {
          cube: '',
          user: ''
        }
        $scope.message = ''
        $scope.logs = []
        $scope.delta = null

        if (!$rootScope.uiPrefs.transactionLogInterval) {
          $rootScope.uiPrefs.transactionLogInterval = 1000
        }
        if (!$rootScope.uiPrefs.transactionLogMaxRows) {
          $rootScope.uiPrefs.transactionLogMaxRows = 1000
        }

        $scope.uiLimit = $rootScope.uiPrefs.transactionLogMaxRows

        function beforeSendTrackChanges(request) {
          request.setRequestHeader('Prefer', 'odata.track-changes')
          return $rootScope.ajaxBeforeSend(request, $scope.instance)
        }
        function beforeSend(request) {
          return $rootScope.ajaxBeforeSend(request, $scope.instance)
        }

        var clear = function () {
          if (loadTimeout) {
            clearTimeout(loadTimeout)
          }
          $scope.delta = null
          $scope.logs = []
        }

        var handleData = function (data, initialRequest) {
          $scope.loading = false
          $scope.message = null
          $scope.delta = data['@odata.deltaLink']
          if (data.value.length) {
            _.each(data.value, function (log) {
              log.Elements = ''
              if (log.Tuple !== null) {
                log.Elements = log.Tuple.join(', ')
              }
              $scope.logs.unshift(log)
              if (
                $scope.logs.length > $rootScope.uiPrefs.transactionLogMaxRows
              ) {
                $scope.logs.pop()
              }
            })
          }
          if (!$scope.isPaused) {
            loadTimeout = setTimeout(function () {
              load()
            }, $rootScope.uiPrefs.transactionLogInterval)
          }
          $scope.$apply()
        }
        var handleError = function (error) {
          console.log({ error })
          clear()
        }

        var initialLoad = function () {
          $scope.logs = []
          var url = '/TransactionLog()?$count=true&$top=0'
          $.ajax({
            type: 'GET',
            url: encodeURIComponent($scope.instance) + url,
            beforeSend: beforeSend
          }).then(
            function (data, text, xhr) {
              var count = data['@odata.count']
              var skip = Math.max(
                count - $rootScope.uiPrefs.transactionLogMaxRows,
                0
              )
              url = '/TransactionLog()?$skip=' + skip
              $.ajax({
                type: 'GET',
                url: encodeURIComponent($scope.instance) + url,
                beforeSend: beforeSendTrackChanges
              }).then(
                function (data, text, xhr) {
                  handleData(data, true)
                },
                function (error) {
                  handleError(error)
                }
              )
            },
            function (error) {
              handleError(error)
            }
          )
        }

        var delta = function () {
          var url = '/' + $scope.delta
          $.ajax({
            type: 'GET',
            url: encodeURIComponent($scope.instance) + url,
            beforeSend: beforeSendTrackChanges
          }).then(
            function (data, text, xhr) {
              handleData(data)
            },
            function (error) {
              handleError(error)
            }
          )
        }
        var load = function (loading) {
          $scope.loading = loading
          if (!$scope.delta) {
            initialLoad()
          } else {
            delta()
          }
        }

        load(true)
        $scope.togglePaused = function () {
          $scope.isPaused = !$scope.isPaused
          if (!$scope.isPaused) {
            load()
          }
        }

        var transactionLogPageColumns = [
          {
            name: 'ID',
            type: 'numeric'
          },
          {
            name: 'ChangeSetID',
            type: 'alpha'
          },
          {
            name: 'TimeStamp',
            type: 'alpha'
          },
          {
            name: 'ReplicationTime',
            type: 'alpha'
          },
          {
            name: 'User',
            type: 'alpha',
            filterable: true
          },
          {
            name: 'Cube',
            type: 'alpha',
            filterable: true
          },
          {
            name: 'Elements',
            type: 'alpha'
          },
          {
            name: 'OldValue',
            type: 'alpha'
          },
          {
            name: 'NewValue',
            type: 'alpha'
          },
          {
            name: 'StatusMessage',
            type: 'alpha'
          }
        ]

        $scope.previousIndex = null
        $scope.pageColumns = $helper.createColumnSortGrid(
          transactionLogPageColumns
        )
        $scope.toggleSortOrder = function (currentIndex) {
          if ($scope.previousIndex == null) {
            $scope.previousIndex = _.clone(currentIndex)
          }
          $helper.updateColumnSortFlags(
            $scope.pageColumns,
            currentIndex,
            $scope.previousIndex
          )
          $scope.logs = $helper.getCustomOrder(
            $scope.logs,
            $scope.pageColumns,
            currentIndex
          )
          $scope.previousIndex = _.clone(currentIndex)
        }

        var toLowerCaseUnlessNull = function (input) {
          if (input) {
            return input.toLowerCase()
          } else {
            return ''
          }
        }

        $scope.logFilter = function (item) {
          if (
            !$scope.selections.cube.length &&
            !$scope.selections.user.length
          ) {
            return true
          }
          var cubeFilter = toLowerCaseUnlessNull($scope.selections.cube)
          var userFilter = toLowerCaseUnlessNull($scope.selections.user)

          if (
            toLowerCaseUnlessNull(item.Cube).indexOf(cubeFilter) !== -1 &&
            toLowerCaseUnlessNull(item.User).indexOf(userFilter) !== -1
          ) {
            return true
          }

          return false
        }

        $scope.filterableFields = _.chain(transactionLogPageColumns)
          .filter(function (f) {
            return f.filterable
          })
          .map('name')
          .value()

        $scope.filters = [] // Array to store filters

        $scope.addFilter = function () {
          $scope.filters.push({ field: '', value: '' })
        }

        $scope.removeFilter = function (index) {
          $scope.filters.splice(index, 1)
        }

        //Trigger an event after the login screen
        $scope.$on('login-reload', function (event, args) {
          if (args.instance === $scope.instance) {
            clear()
            load(true)
          }
        })

        //Close the tab
        $scope.$on('close-tab', function (event, args) {
          // Event to capture when a user has clicked close on the tab
          if (
            args.page == 'arcTransactionLogs' &&
            args.instance == $scope.instance &&
            args.name == null
          ) {
            // The page matches this one so close it
            $rootScope.close(args.page, { instance: $scope.instance })
          }
        })

        //Trigger an event after the plugin closes
        $scope.$on('$destroy', function (event) {
          clear()
        })
      }
    ]
  }
})
