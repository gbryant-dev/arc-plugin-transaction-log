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
        $scope.message = ''
        $scope.logs = []
        $scope.delta = null
        $scope.filters = []
        $scope.filterString = ''

        if (!$rootScope.uiPrefs.transactionLogInterval) {
          $rootScope.uiPrefs.transactionLogInterval = 1000
        }
        if (!$rootScope.uiPrefs.transactionLogMaxRows) {
          $rootScope.uiPrefs.transactionLogMaxRows = 1000
        }

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
              if (log.Tuple !== null) {
                log.Tuple = log.Tuple.join(', ')
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
            if (loadTimeout) {
              clearTimeout(loadTimeout)
            }
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

        $scope.numericOrDateOperators = {
          '=': { value: 'eq' },
          '>': { value: 'gt' },
          '>=': { value: 'ge' },
          '<': { value: 'lt' },
          '<=': { value: 'le' },
          '<>': { value: 'ne' }
        }

        $scope.stringOperators = {
          '=': { value: 'eq' },
          '<>': { value: 'ne' },
          startswith: {
            value: 'startswith',
            signature: 'startswith($1, $2)'
          },
          contains: {
            value: 'contains',
            signature: 'contains($1, $2)'
          }
        }

        $scope.collectionOperators = {
          any: {
            value: 'any',
            signature: '$1/any (t: t eq $2)'
          }
        }

        $scope.transactionFilterColumns = {
          ID: {
            type: 'numeric',
            filterable: true,
            operators: $scope.numericOrDateOperators
          },
          ChangeSetID: {
            type: 'string',
            filterable: true,
            operators: $scope.stringOperators
          },
          TimeStamp: {
            type: 'date',
            filterable: true,
            functions: ['date', 'year', 'month', 'day'],
            operators: $scope.numericOrDateOperators
          },
          ReplicationTime: {
            type: 'date'
          },
          User: {
            type: 'string',
            filterable: true,
            operators: $scope.stringOperators
          },
          Cube: {
            type: 'string',
            filterable: true,
            operators: $scope.stringOperators
          },
          Tuple: {
            type: 'string',
            filterable: true,
            operators: $scope.collectionOperators
          },
          OldValue: {
            type: 'string',
            filterable: true,
            operators: {
              ...$scope.stringOperators,
              ...$scope.numericOrDateOperators
            }
          },
          NewValue: {
            type: 'string',
            filterable: true,
            operators: {
              ...$scope.stringOperators,
              ...$scope.numericOrDateOperators
            }
          },
          StatusMessage: {
            type: 'string'
          }
        }

        $scope.getOperatorsForField = function (field) {
          if (field === '') return {}
          var operators = $scope.transactionFilterColumns[field.key].operators
          return operators
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
            type: 'alpha'
          },
          {
            name: 'Cube',
            type: 'alpha'
          },
          {
            name: 'Tuple',
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

        var replacePlaceholders = function (str) {
          var args = Array.prototype.slice.call(arguments, 1)
          return str.replace(/\$(\d+)/g, function (_, index) {
            var argIndex = parseInt(index) - 1
            return args[argIndex] !== undefined ? args[argIndex] : ''
          })
        }

        var buildFilterString = function () {
          var filters = _.chain($scope.filters)
            .filter(function (f) {
              return f.locked
            })
            .map(function (v) {
              var filterValue =
                $scope.transactionFilterColumns[v.field.key].type === 'string'
                  ? `'${v.value}'`
                  : v.value
              var field = v.field.isFunction ? v.field.name : v.field.key
              return v.operator.signature
                ? `${replacePlaceholders(
                    v.operator.signature,
                    field,
                    filterValue
                  )}`
                : `${field} ${v.operator.value} ${filterValue}`
            })
            .join(' and ')
            .value()

          return filters ? '&$filter=' + filters : ''
        }

        var updateFilterString = function () {
          $scope.filterString = buildFilterString()
        }

        var initialLoad = function () {
          $scope.logs = []
          var url = '/TransactionLog()?$count=true&$top=0' + $scope.filterString
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
              url = '/TransactionLog()?$skip=' + skip + $scope.filterString
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

        $scope.filterableFields = _($scope.transactionFilterColumns)
          .pickBy(function (value, key) {
            return value.filterable
          })
          .mapValues(function (value, key) {
            if (value.functions && value.functions.length) {
              return [{ name: key, key: key, isFunction: false }].concat(
                _.map(value.functions, function (func) {
                  return { name: `${func}(${key})`, key: key, isFunction: true }
                })
              )
            } else {
              return { name: key, key: key, isFunction: false }
            }
          })
          .flatMap()
          .value()

        $scope.addFilter = function () {
          $scope.filters.push({
            field: '',
            operator: 'eq',
            value: '',
            locked: false
          })
        }

        $scope.removeFilter = function (index) {
          $scope.filters.splice(index, 1)
        }

        $scope.lockFilter = function (index) {
          $scope.filters[index].locked = true
        }

        $scope.unlockFilter = function (index) {
          $scope.filters[index].locked = false
        }

        $scope.clearFilters = function () {
          $scope.filters = []
          updateFilterString()
        }

        $scope.applyFilters = function () {
          $scope.filters = _.filter($scope.filters, function (f) {
            return f.locked
          })
          updateFilterString()
        }

        // Refetch logs again if filters have changed
        $scope.$watch(
          'filterString',
          function (newFilterString, oldFilterString) {
            if (newFilterString !== oldFilterString) {
              clear()
              load(true)
            }
          },
          true
        )

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
